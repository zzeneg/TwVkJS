var Q = require('q');
var config = require('./config.json');
var restler = require('restler');
var twitter = require('twitter');
var vksdk = require('vksdk');
var fb = require('fb');
var _ = require('underscore');
var Twvk;
(function (Twvk) {
    var App = (function () {
        function App(twit, users) {
            var _this = this;
            var followIds = '';
            _.each(users, function (u) {
                followIds += u.twitterId + ',';
            });
            twit.stream('statuses/filter', { follow: followIds }, function (stream) {
                stream.on('data', function (tweet) {
                    console.log(tweet);
                    var text = tweet.text;
                    if (!_this.isTweet(text)) {
                        return;
                    }
                    _this.currentUser = _.find(users, function (u) {
                        return u.twitterId === tweet.user.id;
                    });
                    var retweet = tweet.retweeted_status;
                    if (retweet) {
                        if (!_this.currentUser.sendRetweets) {
                            return;
                        }
                        text = 'RT ' + retweet.user.screen_name + ': ' + retweet.text;
                    }
                    _.each(tweet.entities.urls, function (entity) {
                        var fullUrl = entity.expanded_url;
                        text = text.replace(entity.url, fullUrl);
                    });
                    if (_this.currentUser.ignoreInstagram && text.toLowerCase().indexOf('instagram') > 0) {
                        return;
                    }
                    var vk = new Vk(_this.currentUser.vkToken);
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
        Vk.prototype.uploadPhoto = function (fileUrl) {
            var _this = this;
            var d = Q.defer();
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
    var Facebook = (function () {
        function Facebook(accessToken) {
            fb.setAccessToken(accessToken);
        }
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
