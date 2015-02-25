var express = require('express');
var redis = require('redis');

var router = express.Router();


var my_dropbox = require('../lib/my_dropbox');


my_dropbox.check_for_changes();
my_dropbox.check_for_new_img();




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
	    console.log('What tha beat?!');
	    console.log(err);
	    page_title = 'Uh oh..';
	  } else {

	    console.log('Reading from redis:');

	    console.log(object);

	    page_title = 'Newest image';
	    new_img = object.thumb;

	  }

	  res.render('index', { title: page_title, error: err, img: new_img });

	});

	my_dropbox.check_for_new_img();

}); // router.get()

module.exports = router;
