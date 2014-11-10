/*
Get VK token:
https://oauth.vk.com/authorize?client_id={CLIENT_ID}&scope=wall,photos,offline&redirect_uri=http://oauth.vk.com/blank.html&display=page&response_type=token

Get EyeEm token: 
http://eyeem.com/oauth/authorize?response_type=code&client_id={CLIENT_ID}&redirect_uri={RESPONSE_URL}
http://api.eyeem.com/v2/oauth/token?grant_type=authorization_code&client_id={CLIENT_ID}&client_secret={CLIENT_SECRET}
*/

/// <reference path="typings\node\node.d.ts" />
/// <reference path="typings\q\q.d.ts" />
/// <reference path="typings\underscore\underscore.d.ts" />

import Q = require('q');

var config = require('./config.json');

var restler = require('restler');
var twitter = require('twitter');
var vksdk = require('vksdk');
var fb = require('fb');
var _ = require('underscore');

module Twvk {
    export interface IUser {
        name: string;
        twitterId: number;
        vkToken: string;
        sendRetweets: boolean;
        ignoreInstagram: boolean;
    }

    export class App {

        private currentUser: IUser;

        public static init() {
            console.log('START');

            var users = config.users;
            var twit = new twitter(config.twitter);
            var app = new App(twit, users);
        }

        public constructor(twit: any, users: Array<IUser>) {
            var followIds = '';
            _.each(users, u => { followIds += u.twitterId + ','; });

            twit.stream('statuses/filter', { follow: followIds }, (stream) => {
                stream.on('data', (tweet) => {
                    console.log(tweet);
                    var text = tweet.text;

                    if (!this.isTweet(text)) {
                        return;
                    }

                    this.currentUser = _.find(users, u => { return u.twitterId === tweet.user.id; });

                    var retweet = tweet.retweeted_status;
                    if (retweet) {
                        if (!this.currentUser.sendRetweets) {
                            return;
                        }

                        text = 'RT ' + retweet.user.screen_name + ': ' + retweet.text;
                    }

                    _.each(tweet.entities.urls, (entity: any) => {
                        var fullUrl = entity.expanded_url;
                        text = text.replace(entity.url, fullUrl);
                    });

                    if (this.currentUser.ignoreInstagram && text.toLowerCase().indexOf('instagram') > 0) {
                        return;
                    }

                    var vk = new Vk(this.currentUser.vkToken);

                    var media = tweet.entities.media;
                    if (media) {
                        var photoUrl =  media[0].media_url;
                        vk.uploadPhoto(photoUrl).then((photoId) => {
                            vk.wallPost(text, photoId);
                            return;
                        });
                    }

                    vk.wallPost(text);
                });
                stream.on('end', (response) => {
                    // Обработка разъединения
                    console.log('end');
                });
                stream.on('destroy', (response) => {
                    // Обработка 'тихого' разъединения от твиттера
                    console.log('destroy');
                });
            });
        }

        private isTweet(text) {
            return text && text[0] !== '@';
        }
    }

    export class Vk {
        private vk;

        public constructor(vkToken: string) {
            this.vk = new vksdk({mode: 'oauth'});
            this.vk.setToken( { token : vkToken });
        }

        //Method uploading photo to VK
        public uploadPhoto(fileUrl) {
            var d = Q.defer();
            // load image from url
            restler.get(fileUrl, {
                decoding: 'buffer'
            }).on('complete', (imageData) => {
                var photoData = restler.data('temp.jpg', 'image/jpg', imageData);
                // get url for uploading photo
                this.vk.request('photos.getWallUploadServer');
                this.vk.on('done:photos.getWallUploadServer', (data) => {
                    var uploadUrl = data.response.upload_url;
                    restler.post(uploadUrl, {
                        multipart: true,
                        data: { 'photo': photoData }
                    }).on("complete", (data) => {
                        // add photo in wall album
                        this.vk.request('photos.saveWallPhoto', JSON.parse(data));
                        this.vk.on('done:photos.saveWallPhoto', (data) => {
                            // return photo ID
                            d.resolve(data.response[0].id);
                        });
                    });
                });
            });
            return d.promise;
        }

        public wallPost(text: string, photoId?: string) {
            this.vk.request('wall.post', { 'message': text, 'attachments': photoId });
        }
    }

    export class Facebook {
        private facebook;

        constructor(accessToken: string) {
            fb.setAccessToken(accessToken);
        }

        public post(text: string) {
            fb.api('me/feed', 'post', { message: text }, function (res) {
                if (!res || res.error) {
                    console.log(!res ? 'error occurred' : res.error);
                    return;
                }
                console.log('Post Id: ' + res.id);
            });
        }
    }
}

Twvk.App.init();











