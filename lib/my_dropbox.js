//var express = require('express');
var redis = require('redis');

var Dropbox = require("dropbox");
var moment = require('moment');
var request = require('request');


var config = require('../config.json');


/**
 * @internal http://coffeedoc.info/github/dropbox/dropbox-js/master/classes/Dropbox/Client.html
 * @internal https://www.dropbox.com/developers/core/docs
 * 
 * @todo Add weather lookup
 * @todo Add exif info
 * @todo Use a thumbnail instead of the full image
 *
 * @internal
 * 	NOAA rest API
 * 	http://graphical.weather.gov/xml/rest.php#use_it
 *
 * 	By GEO in JSON format
 *  http://forecast.weather.gov/MapClick.php?lat=35.5951540&lon=-82.5521700&unit=0&lg=english&FcstType=json
 */






var dropbox_client = new Dropbox.Client({
    key: config.dropbox.key,
    secret: config.dropbox.secret,
    token: config.dropbox.secret
});

dropbox_client.authDriver(new Dropbox.AuthDriver.NodeServer(8191));




var redis_client = redis.createClient();
 
redis_client.on('connect', function() {
  console.log('Connected to redis..');
});













function dropbox_auth() {

	if ( !dropbox_client.isAuthenticated() ) {

		dropbox_client.authenticate(function(error, dropbox_client) {

		  console.log('authenticating...');

		  if (error) { return false; }

		}); // authenticate()

	} else {

		console.log('dropbox_client already authenticated.');

		return true;

	}

	return ( dropbox_client.isAuthenticated() ) ? true : false;

} // dropbox_auth()













/**
 * This function parses the /img/ directory
 * looking for new images.
 * If it finds new images it adds the photo
 * info to redis.
 *
 * @todo Change this function's name to reflect what it's doing more accurately.
 * @todo Have this function return a callback so we can do other things when it's done.
 *       The callback should pass back an array with the new photo's info.
 * 
 * @return {[type]} [description]
 */
function check_for_new_img() {

	if ( dropbox_auth() ) {

		var file_array = [];


		/**
		 * Parse all files in the directory and add the
		 * path and timestamp to an array.
		 */
		dropbox_client.readdir("/img/", {removed:false}, function(a,b,c,d){
			
			if (a == null){

			    for (var i = 0; i < d.length; i++) {

			      file = d[i].json();

			      //console.log(file);

			      file_moment = moment(file.modified);

			      file.ts = file_moment.format('x');

			      file_array[i] = {};

			      file_array[i]['path'] = file.path;
			      file_array[i]['ts'] = file.ts;
			      file_array[i]['ver'] = file.rev;

			    } // for()



			    // Sort the file array
			    file_array.sort(function(a,b) {

			      andwell = (a.ts < b.ts) ? 'b' : 'a';

			      if (a.ts === b.ts) {
			          return 0;
			      }
			      else {
			          return (a.ts > b.ts) ? -1 : 1;
			      }

			    });


			    // CHECK newest URL against redis
			    // updated if necessary.

				redis_client.hgetall('latest_img', function(err, object) {
				  
				  if (err) {

				  	return false;

				  } else {

				  	if ( !object ){

				  		return set_new_img(file_array[0].path, file_array[0].ts, file_array[0].ver);

				  	} else {

					    if ( (typeof object.ver != undefined) && (object.ver !== file_array[0].ver) ) {

					    	return set_new_img(file_array[0].path, file_array[0].ts, file_array[0].ver);

					    }

					  }

				  }

				});

			}else{

				return false;

			}



		}); // readDir()

	} // if ( isAuthenticated() )



} // check_for_new_img()














function set_new_img(path, ts, ver) {

  var newest_img = null;
  var path = path;

	// Create a public URL for the newest image
	dropbox_client.makeUrl(path, {downloadHack:true}, function(error, url) {

		if (error) {

			return false;

		} else {

			newest_img = url.url;

			thumb = dropbox_client.thumbnailUrl(path, {size:'xl'}); // thumbnailUrl()

			console.log('Writing to redis');

			redis_client.hmset('latest_img', {
			  'url': newest_img,
			  'thumb': thumb,
			  'path': path,
			  'time-taken': 'FUTURE:from-exif',
			  'time-added': ts,
			  'ver': ver
			});

			return true;

		}

	}); // makeUrl()

} // set_new_img()









/**
 * Check the version number of the /img/ folder on dropbox.
 * It will change if there were any modifications to files
 * inside it.
 * 
 * @return bool Whether or not there was there a new file on dropbox
 */
function check_for_changes() {

	if ( dropbox_auth() ) {

		// Check the stats on the root folder
		dropbox_client.stat('/img/', {readDir:false}, function(error, stat, entries) {

			if (error) {

				return false;

			} else {

				var last_checked = null;
				response = stat.json();


				redis_client.get('last_checked', function(err, reply) {

			    last_checked = reply;

					if ( response.rev != last_checked ) {

						/**
						 * @todo Here's where we need to do all of our
						 *       updating and grabbing new images and image data.
						 *
						 * @todo Call check_for_new_img()
						 * 
						 */

						redis_client.set('last_checked', response.rev);

						return true;

					} else {

						return false;
					}

				});

			} // if (error)

		}); // stat()

	}

} // check_for_changes()











/**
 * [get_thumbnail description]
 *
 * @return bool|string URL to the extra large
 *         thumbnail image, or false if not foune.
 */
function get_thumbnail() {

	if ( dropbox_auth() ) {


		redis_client.hgetall('latest_img', function(err, object) {

			if ( object ) {

				if ( object.path == null ) { return false; }

				// Check the stats on the root folder
				thumb = dropbox_client.thumbnailUrl(object.path, {size:'xl'}); // thumbnailUrl()

				return thumb;

			} else {

				return false;
			}

		}); // redis_client.get()

	}

} // check_for_changes()









/**
 * Get EXIF data from the latest image and 
 * store it in Redis.
 * Also, Parse GPS info and store that separately
 * in redis for easy use.
 *
 * @param  {Function} callback [description]
 *
 * @return callback
 */
function get_exif(callback) {

        // http://stackoverflow.com/questions/23257768/javascript-callback-vs-return
        // http://stackoverflow.com/questions/6792663/javascript-style-optional-callbacks

	redis_client.hgetall('latest_img', function(err, object) {


		var https = require('https');



		var request = https.get(object.url, function(response) {
		
		  if ( response.statusCode == 200 ) {


			var fs = require('fs');

			//	
			var file = fs.createWriteStream("temp/latest.jpg");
			
			response.pipe(file);


			file.on('finish', function(){


			    //var fs = require('fs');
				var ExifImage = require('exif').ExifImage;

				try {
					new ExifImage({ image : "temp/latest.jpg" }, function (error, exifData) {
					  if (error) {
					    
					    if ( typeof callback === 'function' && callback() ) { callback(error, null); }

					  } else {

					  	lat = ParseGEO(exifData.gps.GPSLatitude, exifData.gps.GPSLatitudeRef, 'lat');
					  	lng = ParseGEO(exifData.gps.GPSLongitude, exifData.gps.GPSLongitudeRef, 'long');

							redis_client.hmset('latest_img', {
							  'lat': lat,
							  'long': lng,
							  'exif': exifData
							});

					    if ( typeof callback === 'function' && callback() ) { callback(null, [lat, lng]) };
					  }
					});
				} catch (error) {
					if ( typeof callback === 'function' && callback() ) { callback(error, null) };
				}

			}); // on(finish)
			


		  }
		}); // request()

	}); // redis_client.get()

} // check_for_changes()








get_exif(function(e, d){

	console.log('Returned from getting the EXIF data.');
	console.log(e);
	console.log(d);

});







// Turn apple's array of GEO data
// into a decimal reading
function ParseGEO(LatLong, dir) {

    var dd = LatLong[0] + LatLong[1]/60 + LatLong[2]/(60*60);

    if (dir == "S" || dir == "W") {
        dd = dd * -1;
    } // Don't do anything for N or E


    dd = parseFloat(dd.toFixed(5));

    return dd;

}















module.exports.check_for_changes = check_for_changes;
module.exports.check_for_new_img = check_for_new_img;
