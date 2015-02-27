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

	    console.log('Reading from redis:');

	    console.log(object);

	    page_title = object.area;
	    new_img = object.thumb;


	    console.log('Time: ' + object.time_taken + ' GMT' + object.timezone);


	    // @todo Gotta strip the colons out of the dates in order to be valid

	    time_taken = moment("2015 02 26 08:41:53 GMT-0400").calendar();


	  }

	  res.render('index', {
	  	title: page_title,
	  	time_taken: time_taken,
	  	error: err,
	  	img: new_img });

	});


}); // router.get()

module.exports = router;
