# WeatherPic

Grab a photo from Dropbox, get it's EXIF data and based on that, the weather info for the time and location it was taken.

I designed this on a Raspberry Pi B+ model, running [Raspbian](http://raspbian.org) and [RaspCTL](http://ip.raspctl.com) for dynamic DNS, and haven't tested on any other sytems or OSes, but I'd love to hear if anyone tries it on any other system.

## Requirements
+ [Node.js](http://nodejs.org)
+ [Redis Server](http://redis.io)
+ [A Dropbox account](https://www.dropbox.com) with [API access](https://www.dropbox.com/developers/apps)


## Helpful links

+ [Dropbox API](http://coffeedoc.info/github/dropbox/dropbox-js/master/classes/Dropbox/Client.html)
+ [Dropbox Core Docs](https://www.dropbox.com/developers/core/docs)
+ [NOAA Rest API](http://graphical.weather.gov/xml/rest.php#use_it)
+ [Weather info by Geo location](http://forecast.weather.gov/MapClick.php?lat=35.5951540&lon=-82.5521700&unit=0&lg=english&FcstType=json)