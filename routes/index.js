var express = require('express');
var redis = require('redis');
var moment = require('moment');

var router = express.Router();


var my_dropbox = require('../lib/my_dropbox');


my_dropbox.check_for_changes();




var redis_client = redis.createClient();
 
redis_client.on('connect', function() {
  console.log('Connected to redis..');
});





/* GET home page. */
router.get('/', function(req, res, next) {




	 var page_title = null;
	 var new_img = null;


	redis_client.hgetall('latest_img', function(err, object) {
	  
	  if (err) {

	    page_title = 'Uh oh..';

	  } else {

	    page_title = object.area;
	    new_img = object.thumb;
	    time_taken = my_dropbox.ParseTimeToMoment(object);

	  }

	  res.render('index', {
	  	title: page_title,
	  	time_taken: time_taken,
	  	error: err,
	  	img: new_img });

	});


}); // router.get()










/* AJAX to check for new image */
router.get('/changed', function(req, res, next) {

	var challenge = req.query.challenge;

	if ( challenge ) {
		res.render('changed', { challenge: challenge });
	} else {
		res.render('changed', { challenge: 'null' });
	}


});










/* AJAX to check for new image */
router.get('/check', function(req, res, next) {

	console.log('-- BEGINNING THE AJAX CHECK FOR NEW IMAGES  --');

	/**
	* Check for changes on dropbox and wait for the results
	* before we render the page.
	*/
	my_dropbox.check_for_changes(function(is_new){

		console.log('Inside check_for_changes()...');

		// No new changes on Dropbox
		if (!is_new) {

			console.log('Nothing new. Render.');

			result_obj = {
				"error": "false",
				"is_new": "false",
				"results": "null"
			}

			res.render('check_db', {
				results: JSON.stringify(result_obj)
			});

		} else {

			console.log('Found something. Dig deeper...');

			// Something changed on dropbox since the
			// last time we looked.
			// Scan the directory to decide whether it
			// was a new image.
			my_dropbox.check_for_new_img(function(found_new){

				console.log('Inside check_for_new_img()...');

				if ( !found_new ) {

					console.log('Nothing new.');

					// No new image found.
					result_obj = {
						"error": "false",
						"is_new": "false",
						"results": "null"
					}

				} else {

					console.log('Found a new image in the db folder. Get its info from Redis.');

					redis_client.hgetall('latest_img', function(err, object) {

						result_obj = {
							"error": "false",
							"is_new": "true",
							"results": object
						}

					}); // hgetall()

				}

				console.log('Final Render.');

				res.render('check_db', {
					results: JSON.stringify(result_obj)
				});


			}); // check_for_new_img()

		} // if (!is_new)

	}); // check_for_changes()



}); // router.get()




module.exports = router;
