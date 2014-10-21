/*
Get VK token:
https://oauth.vk.com/authorize?client_id={CLIENT_ID}&scope=wall,photos,offline&redirect_uri=http://oauth.vk.com/blank.html&display=page&response_type=token
Get EyeEm token:
http://eyeem.com/oauth/authorize?response_type=code&client_id={CLIENT_ID}&redirect_uri={RESPONSE_URL}
http://api.eyeem.com/v2/oauth/token?grant_type=authorization_code&client_id={CLIENT_ID}&client_secret={CLIENT_SECRET}
*/
/// <reference path="typings\node\node.d.ts" />
/// <reference path="typings\q\q.d.ts" />
var Q = require('q');

var config = require('./config.json');

var restler = require('restler');
var twitter = require('twitter');
var vksdk = require('vksdk');
var fb = require('fb');

var Twvk;
(function (Twvk) {
    var App = (function () {
        function App(twit, users) {
            var _this = this;
            var followIds = '';
            for (var u in users) {
                followIds += users[u].twitterId + ',';
            }

            twit.stream('statuses/filter', { follow: followIds }, function (stream) {
                stream.on('data', function (tweet) {
                    console.log(tweet);
                    var text = tweet.text;
                    if (!_this.isTweet(text)) {
                        return;
                    }

                    var userId = tweet.user.id;
                    for (var u in users) {
                        if (users[u].twitterId === userId) {
                            _this.currentUser = users[u];
                        }
                    }

                    var retweet = tweet.retweeted_status;
                    if (retweet) {
                        if (!_this.currentUser.sendRetweets) {
                            return;
                        }

                        text = 'RT ' + retweet.user.screen_name + ': ' + retweet.text;
                    }

                    var urls = tweet.entities.urls;
                    if (urls) {
                        for (var i = 0; i < urls.length; i++) {
                            var url = urls[i].url;
                            var fullUrl = urls[i].expanded_url;
                            text = text.replace(url, fullUrl);
                            if (fullUrl.toLowerCase().indexOf('http://eyeem.com/p/') === 0) {
                                var eyeemPhotoId = fullUrl.toLowerCase().replace("http://eyeem.com/p/", "");
                            }
                        }
                    }

                    var vk = new Vk(_this.currentUser.vkToken);

                    if (eyeemPhotoId) {
                        var eyeEm = new EyeEm(_this.currentUser.eyeEmToken);
                        eyeEm.getEyeEmPhotoUrlById(eyeemPhotoId).then(function (photoUrl) {
                            vk.uploadPhoto(photoUrl).then(function (photoId) {
                                vk.wallPost(text, photoId);
                                return;
                            });
                        });
                    }

                    var media = tweet.entities.media;
                    if (media) {
                        var photoUrl = media[0].media_url;
                        vk.uploadPhoto(photoUrl).then(function (photoId) {
                            vk.wallPost(text, photoId);
                            return;
                        });
                    }

                    vk.wallPost(text);
                });
                stream.on('end', function (response) {
                    // Обработка разъединения
                    console.log('end');
                });
                stream.on('destroy', function (response) {
                    // Обработка 'тихого' разъединения от твиттера
                    console.log('destroy');
                });
            });
        }
        App.init = function () {
            console.log('START');

            var users = config.users;
            var twit = new twitter(config.twitter);
            var app = new App(twit, users);
        };

        App.prototype.isTweet = function (text) {
            return text && text[0] !== '@';
        };
        return App;
    })();
    Twvk.App = App;

    var Vk = (function () {
        function Vk(vkToken) {
            this.vk = new vksdk({ mode: 'oauth' });
            this.vk.setToken({ token: vkToken });
        }
        //Method uploading photo to VK
        Vk.prototype.uploadPhoto = function (fileUrl) {
            var _this = this;
            var d = Q.defer();

            // load image from url
            restler.get(fileUrl, {
                decoding: 'buffer'
            }).on('complete', function (imageData) {
                var photoData = restler.data('temp.jpg', 'image/jpg', imageData);

                // get url for uploading photo
                _this.vk.request('photos.getWallUploadServer');
                _this.vk.on('done:photos.getWallUploadServer', function (data) {
                    var uploadUrl = data.response.upload_url;
                    restler.post(uploadUrl, {
                        multipart: true,
                        data: { 'photo': photoData }
                    }).on("complete", function (data) {
                        // add photo in wall album
                        _this.vk.request('photos.saveWallPhoto', JSON.parse(data));
                        _this.vk.on('done:photos.saveWallPhoto', function (data) {
                            // return photo ID
                            d.resolve(data.response[0].id);
                        });
                    });
                });
            });
            return d.promise;
        };

        Vk.prototype.wallPost = function (text, photoId) {
            this.vk.request('wall.post', { 'message': text, 'attachments': photoId });
        };
        return Vk;
    })();
    Twvk.Vk = Vk;

    var EyeEm = (function () {
        function EyeEm(eyeEmToken) {
            this.eyeEmToken = eyeEmToken;
        }
        //Method getting photo URL from EyeEm
        EyeEm.prototype.getEyeEmPhotoUrlById = function (eyeemPhotoId) {
            var d = Q.defer();
            var url = 'https://api.eyeem.com/v2/photos/' + eyeemPhotoId + '?access_token=' + this.eyeEmToken;
            restler.get(url).on('complete', function (data) {
                var fileId = data.photo.file_id;
                var width = data.photo.width;
                var height = data.photo.height;
                var photoUrl = 'https://eyeem.com/thumb/' + width + '/' + height + '/' + fileId;
                d.resolve(photoUrl);
            });
            return d.promise;
        };
        return EyeEm;
    })();
    Twvk.EyeEm = EyeEm;

    var Facebook = (function () {
        function Facebook(accessToken) {
            fb.setAccessToken(accessToken);
        }
        Facebook.prototype.getAccessToken = function () {
            var d = Q.defer();
            fb.api('oauth/access_token', {
                client_id: config.facebook.appId,
                client_secret: config.facebook.appSecret,
                grant_type: 'client_credentials'
            }, function (res) {
                if (!res || res.error) {
                    d.reject(!res ? 'error occurred' : res.error);
                }

                var accessToken = res.access_token;
                console.log(accessToken);
                d.resolve(accessToken);
            });
            return d.promise;
        };

        Facebook.prototype.post = function (text) {
            fb.api('me/feed', 'post', { message: text }, function (res) {
                if (!res || res.error) {
                    console.log(!res ? 'error occurred' : res.error);
                    return;
                }
                console.log('Post Id: ' + res.id);
            });
        };
        return Facebook;
    })();
    Twvk.Facebook = Facebook;
})(Twvk || (Twvk = {}));

Twvk.App.init();
