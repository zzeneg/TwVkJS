var restler = require('restler');
var twitter = require('twitter');
var vksdk = require('vksdk');
var config = require('./config.json');

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

                    _this.vk = new vksdk({ mode: 'oauth' });
                    _this.vk.setToken({ token: _this.currentUser.vkToken });

                    if (eyeemPhotoId) {
                        _this.getEyeEmPhotoUrlById(eyeemPhotoId, function (photoId) {
                            _this.vk.request('wall.post', { 'message': text, 'attachments': photoId });
                        });
                        return;
                    }

                    var media = tweet.entities.media;
                    if (media) {
                        var photoUrl = media[0].media_url;
                        _this.uploadPhoto(photoUrl, function (photoId) {
                            _this.vk.request('wall.post', { 'message': text, 'attachments': photoId });
                        });
                        return;
                    }

                    _this.vk.request('wall.post', { 'message': text });
                });
                stream.on('end', function (response) {
                    console.log('end');
                });
                stream.on('destroy', function (response) {
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

        App.prototype.uploadPhoto = function (fileUrl, callback) {
            var _this = this;
            restler.get(fileUrl, {
                decoding: 'buffer'
            }).on('complete', function (imageData) {
                var photoData = restler.data('temp.jpg', 'image/jpg', imageData);

                _this.vk.request('photos.getWallUploadServer');
                _this.vk.on('done:photos.getWallUploadServer', function (data) {
                    var uploadUrl = data.response.upload_url;
                    restler.post(uploadUrl, {
                        multipart: true,
                        data: { 'photo': photoData }
                    }).on("complete", function (data) {
                        _this.vk.request('photos.saveWallPhoto', JSON.parse(data));
                        _this.vk.on('done:photos.saveWallPhoto', function (data) {
                            callback(data.response[0].id);
                        });
                    });
                });
            });
        };

        App.prototype.getEyeEmPhotoUrlById = function (eyeemPhotoId, callback) {
            var _this = this;
            var url = 'https://api.eyeem.com/v2/photos/' + eyeemPhotoId + '?access_token=' + this.currentUser.eyeEmToken;
            restler.get(url).on('complete', function (data) {
                var fileId = data.photo.file_id;
                var width = data.photo.width;
                var height = data.photo.height;
                var photoUrl = 'https://eyeem.com/thumb/' + width + '/' + height + '/' + fileId;
                _this.uploadPhoto(photoUrl, callback);
            });
        };

        App.prototype.isTweet = function (text) {
            return text && text[0] !== '@';
        };
        return App;
    })();
    Twvk.App = App;
})(Twvk || (Twvk = {}));

Twvk.App.init();