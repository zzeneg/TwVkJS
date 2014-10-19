module.exports = function (grunt) {
    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),
        ts: {
            build: {
                src: ['*.ts'],
            },
            options: {
                sourceMap: false,
            }   
        },
        watch: {
            files: ['*.ts'],
            tasks: ['ts']
        },
        nodemon: {
            dev: {
                script: 'twvk.js'
            }
        },
        concurrent: {
            tasks: ['nodemon', 'watch'],
            options: {
                logConcurrentOutput: true
            }
        }
    });

    grunt.event.on('watch', function(action, filepath, target) {
      grunt.log.writeln(filepath + ' has ' + action);
    })

    grunt.loadNpmTasks('grunt-ts');
    grunt.loadNpmTasks('grunt-contrib-watch');
    grunt.loadNpmTasks('grunt-nodemon');
    grunt.loadNpmTasks('grunt-concurrent');
 
    grunt.registerTask('default', ['concurrent']);
}