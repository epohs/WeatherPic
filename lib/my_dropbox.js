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
    token: config.dropbox.token
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
function check_for_new_img(callback) {

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

				  	if ( typeof callback === 'function' ) { callback(false); }

				  } else {

				  	if ( !object ){

				  		set_new_img(file_array[0].path, file_array[0].ts, file_array[0].ver, function(){

								get_exif(function(e, d){

									get_weather_data(function(e, d){

										console.log('Got all my data.');
										if ( typeof callback === 'function' ) { callback(true); }

									}); // get_weather_data()

								});

				  		});

				  	} else {

					    if ( (typeof object.ver != undefined) && (object.ver !== file_array[0].ver) ) {

					  		set_new_img(file_array[0].path, file_array[0].ts, file_array[0].ver, function(){

									get_exif(function(e, d){

										get_weather_data(function(e, d){

											console.log('Got all my data.');
											if ( typeof callback === 'function' ) { callback(true); }

										}); // get_weather_data()

									});

					  		});

					    }

					  }

				  }

				});

			}else{

				if ( typeof callback === 'function' ) { callback(false); }

			}



		}); // readDir()

	} // if ( isAuthenticated() )



} // check_for_new_img()














function set_new_img(path, ts, ver, callback) {

  var newest_img = null;
  var path = path;

	// Create a public URL for the newest image
	dropbox_client.makeUrl(path, {downloadHack:true}, function(error, url) {

		if (error) {

			if ( typeof callback === 'function' ) { callback(false); }

		} else {

			newest_img = url.url;

			thumb = dropbox_client.thumbnailUrl(path, {size:'xl'}); // thumbnailUrl()

			redis_client.hmset('latest_img', {
			  'url': newest_img,
			  'thumb': thumb,
			  'path': path,
			  'time_added': ts,
			  'ver': ver
			});

			if ( typeof callback === 'function' ) { callback(true); }

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
function check_for_changes(callback) {

	console.log('Checking dropbox for changes..');

	if ( dropbox_auth() ) {

		console.log('Authorized to scan dropbox.');

		/** Check the stats on the root folder
		 * THIS DOESN'T WORK
		 * Dropox folder rev ID doesn't change when a file is
		 * added or removed.
		 *
		 * Try 'webhooks' instead.
		 * https://www.dropbox.com/developers/webhooks/docs
		 * Or
		 * https://www.dropbox.com/developers/datastore/docs/js#Dropbox.Http.PollResult
		 */


		dropbox_client.stat('/img/', {readDir:true}, function(error, stat, entries) {

			if (error) {
				if ( typeof callback === 'function' ) { callback(false); } else { return false; }

			} else {

				var last_checked = null;
				response = stat.json();


				console.log('Comparing db folder version with stored version');

				redis_client.get('last_checked', function(err, reply) {

			    	last_checked = reply;

			    	console.log('Dropbox folder version: ' + response.rev + ' Last checked (via redis): ' + last_checked);

			    	console.log(response);
			    	console.log(entries);

					if ( response.rev != last_checked ) {

						console.log('Something has changed. Look for new images on dropbox.');

						/**
						 * @todo Here's where we need to do all of our
						 *       updating and grabbing new images and image data.
						 *
						 * @todo Call check_for_new_img()
						 * 
						 */

						check_for_new_img();

						redis_client.set('last_checked', response.rev);

						if ( typeof callback === 'function' ) { callback(true); } else { return true; }

					} else {

						console.log('Dropbox hasnt changed since the last time we checked.');

						if ( typeof callback === 'function' ) { callback(false); } else { return false; }
					}

				}); // get('last_checked')

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

} // get_thumbnail()









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
					    
					    if ( typeof callback === 'function' ) { callback(error, null); }

					  } else {

					  	lat = ParseGEO(exifData.gps.GPSLatitude, exifData.gps.GPSLatitudeRef, 'lat');
					  	lng = ParseGEO(exifData.gps.GPSLongitude, exifData.gps.GPSLongitudeRef, 'long');

							redis_client.hmset('latest_img', {
							  'lat': lat,
							  'long': lng,
							  'time_taken': exifData.exif.DateTimeOriginal,
							  'exif': exifData
							});

					    if ( typeof callback === 'function' ) { callback(null, [lat, lng]) };
					  }
					});
				} catch (error) {
					if ( typeof callback === 'function' ) { callback(error, null) };
				}

			}); // on(finish)
			


		  }
		}); // https.get()

	}); // redis_client.hgetall()

} // get_exif()












function get_weather_data(callback) {


	redis_client.hgetall('latest_img', function(err, object) {

		var ret_err =  null;
		var ret_data =  null;

		var http = require('http');

		var request = http.get('http://forecast.weather.gov/MapClick.php?lat='+object.lat+'&lon='+object.long+'&unit=0&lg=english&FcstType=json', function(response) {

  		var data = '';

  		response.on('data', function(chunk) { data += chunk; });

			response.on('end', function() {


				data = JSON.parse(data);

				wind_dirs = ['S','NE','E','SE','S','SW','W','NW'];

				wind_i = (Math.round((data.currentobservation.Windd / 360) * wind_dirs.length)) % wind_dirs.length;

				wind_i = (wind_i < 0) ? (wind_i += wind_dirs.length) : wind_i;



				tz_codes = [
										{"abbr":"V", "offset":"-0400"},
										{"abbr":"E", "offset":"-0500"},
										{"abbr":"C", "offset":"-0600"},
										{"abbr":"M", "offset":"-0700"},
										{"abbr":"P", "offset":"-0800"},
										{"abbr":"A", "offset":"-0900"},
										{"abbr":"H", "offset":"-1000"},
										{"abbr":"G", "offset":"-1000"},
										{"abbr":"S", "offset":"-1300"}
									 ];


				our_tz = tz_codes.filter(function (tz) { return tz.abbr == "V" });



				weather_data = {
					'summary': data.currentobservation.Weather,
					'temp': data.currentobservation.Temp + '°F',
					'wind': data.currentobservation.Winds + 'mph ' + wind_dirs[wind_i]
				}


				redis_client.hmset('latest_img', {
					'area': data.location.areaDescription,
					'elev': data.currentobservation.elev,
					'timezone': our_tz[0].offset,
					'weather_data': weather_data
				});

				if ( typeof callback === 'function' ) { callback(null, weather_data) };

			});

		}).on('error', function(e) {

			if ( typeof callback === 'function' ) { callback(e, null); }

		}).end(); // https.get()


	}); // redis_client.hgetall()

} // get_weather_data()
















// Turn apple's array of GEO data
// into a decimal reading
function ParseGEO(LatLong, dir) {

    var dd = LatLong[0] + LatLong[1]/60 + LatLong[2]/(60*60);

    if (dir == "S" || dir == "W") {
        dd = dd * -1;
    } // Don't do anything for N or E


    dd = parseFloat(dd.toFixed(5));

    return dd;
 
} // ParseGEO()





/**
 * Take a combination of the EXIF time field
 * and the timezone from our weather data
 * and produce a string that moment.js will understand.
 */
function ParseTimeToMoment(object) {

	var time_array = object.time_taken.split(" ");

	var just_date = time_array[0].replace(/\:/gi, ' ');

	var time_taken = just_date + ' ' + time_array[1] + ' GMT' + object.timezone;

	time_taken = moment(time_taken).calendar();

	return time_taken;
} // ParseTimeToMoment()












module.exports.ParseTimeToMoment = ParseTimeToMoment;
module.exports.check_for_changes = check_for_changes;
module.exports.check_for_new_img = check_for_new_img;