module.exports = function( grunt ) {
	'use strict';

	grunt.loadNpmTasks( 'grunt-contrib-jshint' );
	//grunt.loadNpmTasks( 'grunt-contrib-qunit' );

	grunt.initConfig( {
		jshint: {
			all: [ 'worker/EmsArgs.js', 'worker/EmsWorkerProxy.js', 'worker/FlacEncoder.js', 'test/*.js' ]
		},
		qunit: {
			all: [ 'test/index.html' ]
		}
	} );

	grunt.registerTask( 'test', [ 'jshint' ] );
	grunt.registerTask( 'default', [ 'test' ] );
};
