# WeatherPic

Grab a photo from Dropbox, get it's EXIF data and, based on that the weather info for the location and time it was taken. Then display the weather data overlaying the photo on a simple webpage.

The photo will be served from dropbox, and any changes (photos added, removed, or edited) within the app */img/* folder on Drobpox will trigger a [dropbox webhook](https://www.dropbox.com/developers/webhooks) to handle updates on our end.

I designed this on a Raspberry Pi B+ model, running [Raspbian](http://raspbian.org) and [RaspCTL](http://ip.raspctl.com) for dynamic DNS, and haven't tested on any other sytems or OSes, but I'd love to hear if anyone tries it on any other system.

**NOTE:** *As of March 1, 2015 this is a total work in progress. Things are not working completely yet.*


## Requirements

+ [Node.js](http://nodejs.org)
+ [Redis Server](http://redis.io)
+ [A Dropbox account](https://www.dropbox.com) with [API access](https://www.dropbox.com/developers/apps)


## Helpful links

+ [Dropbox API](http://coffeedoc.info/github/dropbox/dropbox-js/master/classes/Dropbox/Client.html)
+ [Dropbox Core Docs](https://www.dropbox.com/developers/core/docs)
+ [NOAA Rest API](http://graphical.weather.gov/xml/rest.php#use_it)
+ [Weather info by Geo location](http://forecast.weather.gov/MapClick.php?lat=35.5951540&lon=-82.5521700&unit=0&lg=english&FcstType=json)


### Todo

+ ~~AJAX~~ [webhook](https://www.dropbox.com/developers/webhooks) for image checking & automatic refresh.
+ Set a max size for the /img/ folder, with auto-pruning of older images.
+ Thumbnail display of previous images. 