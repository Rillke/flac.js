/*!
 * Copyright © 2014 Rainer Rillke <lastname>@wikipedia.de
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to
 * deal in the Software without restriction, including without limitation the
 * rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
 * sell copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
 * IN THE SOFTWARE.
 */

/*global tags: false, console: false, URL: false, saveAs: false, alert: false*/
/*jslint vars: false,  white: false */
/*jshint onevar: false, white: false, laxbreak: true, worker: true */

( function( global ) {
	'use strict';

	var $button, $fileInput, $workerDlg, $workerProgress, $downloads, $console, $errors, $info, $sampleFileList, $testclip;
	var worker, lastInfile, flacPlaybackSupported, wavPlaybackSupported;
	var __onDropOrPaste, __onDragOver, __onSamplefileClick;
	var $body = $( document.body );
	var storedFiles = {},
		outData = {},
		pendingTagAttributes = [],
		$cmd = $( '#oe-cmd-options' ),
		allTags = {},
		availableTags = $.map( tags, function( tagDetails, tag ) {
			var ret = [ '--' + tag ];
			allTags[ '--' + tag ] = tagDetails;
			if ( tagDetails.short ) {
				ret.push( '-' + tagDetails.short );
				allTags[ '-' + tagDetails.short ] = tagDetails;
			}
			return ret;
		} );

	$button = $( '#oe-run-button' );
	$fileInput = $( '#oe-run-file' );
	$workerDlg = $( '<div>' );
	$workerProgress = $( '<progress style="display: inline-block; text-align: center; width: 100%;" value="0" max="100">Your browser does not support this tool. Upgrade to a modern browser, please.</progress>' )
		.appendTo( $workerDlg );
	$downloads = $( '<div>' )
		.css( 'overflow', 'auto' )
		.css( 'margin', '1em 0' )
		.addClass( 'ui-state-highlight' )
		.hide()
		.appendTo( $workerDlg );
	$console = $( '<div style="overflow: auto; height: 350px; border: 1px solid grey; padding: 2px; resize: both; white-space: pre-wrap;" class="oe-console"></div>' )
		.appendTo( $workerDlg );
	$errors = $( '<pre>' )
		.addClass( 'oe-console-errors' );
	$info = $( '<pre>' )
		.addClass( 'oe-console-info' );
	$testclip = $( '.oe-test-clip' );

	function refresh() {
		outData = {};
		$fileInput
			.removeAttr( 'disabled' )
			.closest( 'form' )[0]
			.reset();
		$body.on( {
			drop: __onDropOrPaste,
			paste: __onDropOrPaste,
			dragover: __onDragOver
		} );
		$console.empty();
		$downloads.find( 'a' ).each( function() {
			try {
				URL.revokeObjectURL( $( this ).attr( 'href' ) );
			} catch ( ex ) {
				console.error( ex );
			}
		} );
		$downloads.empty().hide();
		$workerProgress.val( 0 ).show();
		$errors.empty();
		worker = new Worker( 'worker/EmsWorkerProxy.js' );
		worker.onmessage = onWorkerMessage;
		if ( lastInfile ) {
			delete storedFiles[ lastInfile ];
		}
	}

	function log( txt ) {
		$info
			.clone()
			.text( txt )
			.appendTo( $console );
	}
	function err( txt ) {
		$errors
			.clone()
			.text( txt.message || txt )
			.appendTo( $console );
	}
	function encode( args ) {
		var argsForCommandLine = args.slice( 0 );

		$.each( argsForCommandLine, function( idx, arg ) {
			argsForCommandLine[ idx ] = arg.replace( /\"/g, '\\"' );
		} );
		log( 'encoder@rillke.com$ flac "' + argsForCommandLine.join( '" "' ) + '"' );
		log( 'loading web worker scripts (0.7 + 2.8 MiB) ...' );

		if ( !worker ) {
			err( 'No webworker available.' );
			err( 'Aborting.' );
			$workerDlg
				.dialog( 'option', 'title', 'Error - Failed to load web worker' )
				.dialog( 'widget' )
				.find( '.ui-dialog-titlebar' )
				.show();
			return;
		}
		worker.onerror = err;

		worker.postMessage( {
			command: 'encode',
			args: args,
			outData: outData,
			fileData: storedFiles
		} );
	}
	function objKeyCount( obj ) {
		var i = 0;
		for ( var k in obj ) {
			if ( obj.hasOwnProperty( k ) ) ++i;
		}
		return i;
	}
	function prepareWorkerDlg( encodedFilesAvailable ) {
		$workerDlg.dialog( {
			'modal': true,
			'title': 'Encoding completed - '
				+ ( encodedFilesAvailable ? 'encoded files and ' : '' )
				+ 'log available',
			'closeOnEscape': false,
			'dialogClass': 'oe-progress-dialog',
			'width': 780,
			'open': function() {
				if ( doArgsContainNoinputfile() ) {
					$( this )
						.dialog( 'option', 'title', 'flac help' );
					$workerProgress.hide();
				} else {
					$( this )
						.dialog( 'widget' )
						.find( '.ui-dialog-titlebar' )
						.hide();
				}
				$body.css( 'overflow', 'hidden' );
			},
			'close': function() {
				$body.removeAttr( 'style' );
				refresh();
			}
		} );
	}
	function forEachArg( cb, args ) {
		args = args || $cmd.tagit( 'assignedTags' );
		$.each( args, function( i, arg ) {
			var reSwitch = /^\-\-?/,
				reArgVal = /\=.+$/,
				argClean = arg.replace( reArgVal, '' );

			return cb( arg, reSwitch.test( arg ), argClean, allTags[ arg.replace( reArgVal, '' ) ] );
		} );
	}
	function getArgValue( refArg, args ) {
		var retArgInfo = null,
			retArgVal = null,
			refArgInfo, nextIsValue;

		refArg = refArg.replace( /\=.+$/, '' );
		refArgInfo = allTags[ refArg ];
		forEachArg( function( arg, isSwitch, cleanArg, argInfo ) {
			if ( nextIsValue ) {
				retArgVal = arg;
				return false;
			} else if ( refArg === cleanArg ) {
				retArgInfo = argInfo;
				retArgVal = arg.replace( /^\-\-.+?\=\"(.+)\"$/, '$1' );
				return false;
			} else if ( argInfo && refArgInfo.short && ( refArgInfo.short === argInfo.short ) ) {
				retArgInfo = argInfo;
				nextIsValue = true;
			}
		}, args );
		return [ retArgVal, retArgInfo ];
	}
	function getArgs( buffInFile, inFileName ) {
		var args = $cmd.tagit( 'assignedTags' ),
			outputArg, outputName, decode, analyze, test, ogg,
			prefix, rawForced, aiffForced, rf64Forced, wav64Forced,
			pastArg;

		forEachArg( function( arg, isSwitch, cleanArg, argInfo ) {
			var logMessage;

			if ( pastArg ) {
				outData[ arg ] = pastArg;
				return pastArg = undefined;
			}
			if ( !isSwitch ) {
				return;
			}

			if ( argInfo ) {
				pastArg = argInfo.outfile;
			} else {
				pastArg = undefined;
				logMessage = '"' + cleanArg + '" is an unknown command line switch.';
				if ( console.warn ) console.warn( logMessage );
				log( logMessage );
			}
		}, args );

		if ( buffInFile ) {
			lastInfile = inFileName;
			storedFiles[ inFileName ] = new Uint8Array( buffInFile );
			// determine name of output file
			// and its MIME type
			outputArg = getArgValue( '--output-name', args );
			decode = getArgValue( '--decode', args );
			test = getArgValue( '--test', test );
			analyze = getArgValue( '--analyze', args );
			ogg = getArgValue( '--ogg', args );

			var ext = '.flac',
				mime = 'audio/flac';
			if ( ogg[1] ) {
				ext = '.oga';
				mime = 'audio/ogg';
			}
			if ( decode[1] ) {
				ext = '.wav';
				mime = 'audio/wav';
				rawForced = getArgValue( '--force-raw-format', args );
				aiffForced = getArgValue( '--force-aiff-format', args );
				rf64Forced = getArgValue( '--force-rf64-format', args );
				wav64Forced = getArgValue( '--force-wave64-format', args );
				if ( rawForced[1] ) {
					ext = '.raw';
					mime = 'audio/x-raw';
				} else if ( aiffForced[1] ) {
					ext = '.aiff';
					mime = 'audio/x-aiff';
				} else if ( rf64Forced[1] ) {
					ext = '.rf64';
					mime = 'audio/x-rf64';
				} else if ( wav64Forced[1] ) {
					ext = '.w64';
					mime = 'audio/x-wav64';
				}
			}
			if ( analyze[1] ) {
				ext = '.ana';
				mime = 'text/plain';
			}

			if ( outputArg[0] ) {
				outputName = outputArg[0];
			} else {
				prefix = getArgValue( '--output-prefix', prefix );
				prefix = prefix[0] || '';
				outputName = prefix + inFileName.replace( /\.\w{1,5}$/, ext );
			}
			if ( !test[1] || getArgValue( '--stdout', args )[1] ) {
				outData[ outputName ] = {
					'MIME': mime
				};
			}

			// input file must be last arg
			args.push( inFileName );
		}
		return args;
	}
	function prepareEncode( f ) {
		var fr = new FileReader(),
			args;

		f = f || $fileInput[ 0 ].files[ 0 ];
		if ( f ) {
			$fileInput.attr( 'disabled', 'disabled' );
			$body.off( 'dragover drop' );

			fr.addEventListener( 'loadend', function() {
				args = getArgs( fr.result, f.name );
				prepareWorkerDlg( !!objKeyCount( outData ) );
				encode( args );
			} );
			fr.readAsArrayBuffer( f );
		} else {
			args = getArgs();
			prepareWorkerDlg( false );
			encode( args, true );
		}
	}

	function doArgsContainNoinputfile() {
		var retval = false;

		forEachArg( function( arg, isSwitch, cleanArg, argInfo ) {
			if ( argInfo && argInfo.noinputfile ) {
				retval = true;
				return false;
			}
		} );

		return retval;
	}

	function showHideFileInput() {
		if ( doArgsContainNoinputfile() ) {
			$fileInput.hide();
		} else {
			$fileInput.show();
		}
	}

	function beforeRemovedTag( e, ui ) {
		var fileName = ui.tag.data( 'storedfile' );
		if ( fileName ) {
			delete storedFiles[ fileName ];
		}

		var belongsTo = ui.tag.data( 'belongsto' );
		if ( belongsTo ) {
			belongsTo.tag.find('.ui-icon-close').click();
		}
	}

	function validateTag( e, ui ) {
		var tagInfo, tagAttr, dashDashArg;

		if ( ui.duringInitialization ) return;
		if ( !/^\-/.test( ui.tagLabel ) ) {
			while ( pendingTagAttributes.length ) {
				tagAttr = pendingTagAttributes.pop();
				ui.tag[ tagAttr[0] ]( tagAttr[1], tagAttr[2] );
			}
			return;
		}

		showHideFileInput();

		tagInfo = allTags[ ui.tagLabel ];
		dashDashArg = /^\-\-/.test( ui.tagLabel );

		if ( !tagInfo || !tagInfo.fmt ) return;
		var $dlg = $( '<form>' ),
			$submit = $( '<input type="submit" value="Submit" />' )
				.css( {
					'position': 'absolute',
					'z-index': '-1',
					'top': 0,
					'left': 0
				} )
				.fadeTo( 0, 0 )
				.appendTo( $dlg ),
			$pre = $( '<pre>' )
				.css( {
					'width': '100%',
					'height': '300px',
					'padding': '0px',
					'margin': '1em 0',
					'overflow': 'auto',
					'resize': 'both'
				} )
				.text( tagInfo.desc )
				.appendTo( $dlg ),
			$input = $( '<input>' )
				.attr( {
					'pattern': (tagInfo.regexp || '/.*/').toString()
						.replace( /^\/(.+)\/$/, '$1' ),
					'required': 'required',
					'title': tagInfo.constraint || tagInfo.desc,
					'value': tagInfo.fmt,
					'name': 'foobar'
				} )
				.appendTo( $dlg ),
			$fileParamInput = $( '<input id="files" name="file" style="width:98%" type="file" required="required" autocomplete="off" />' );

		if ( tagInfo.infile ) {
			$fileParamInput
				.attr( 'accept', tagInfo.infile.accept )
				.change( function() {
					$input.val( $input.val().replace( 'file', $fileParamInput[ 0 ].files[ 0 ].name ) );
				} )
				.insertBefore( $input );
		}
		$dlg.dialog( {
			'title': 'Options for ' + ui.tagLabel,
			'modal': true,
			'width': 500,
			'autoOpen': false,
			'buttons': {
				'Okay': function() {
					if ( $input[ 0 ].checkValidity() ) {
						$dlg.submit();
					} else {
						$( '<div>' )
							.addClass( 'ui-state-highlight' )
							.text( tagInfo.constraint || tagInfo.desc )
							.insertAfter( $input );
						$input.focus()
							.select();
					}
				}
			},
			'open': function() {
				( tagInfo.infile ? $fileParamInput : $input )
					.focus()
					.select();
			},
			'close': function() {
				$dlg.remove();
			}
		} );
		$dlg.submit( function( e ) {
			var f, fr, fileName, inputVal;

			// Prevent submitting data to non-existant server
			e.preventDefault();

			// Disable all inputs to prevent interaction
			// after submitting data e.g. during reading the file
			$dlg.find( 'input' )
				.attr( 'disabled', 'disabled' );
			$dlg.dialog( 'widget' )
				.find( '.ui-dialog-titlebar,.ui-dialog-buttonpane' )
				.hide();

			// jQuery TagIt does not like commas and returns multiple tags
			// when programmatically adding tags with commans inside
			inputVal = $input.val().replace( /,/g, '-' );

			if ( dashDashArg ) {
				// Remove self since we must add the value to
				// the dashdash arg directly
				ui.tag.find('.ui-icon-close').click();
			} else {
				// Queue for next arg
				pendingTagAttributes.push( [ 'data', 'belongsto', ui ] );
			}
			if ( tagInfo.infile ) {
				f = $fileParamInput[ 0 ].files[ 0 ];
				fr = new FileReader();

				fileName = inputVal;
				if ( /\|/.test( fileName ) ) {
					fileName = fileName.replace( /(?:\|.+?)*\|(.+)$/, '$1' );
				}

				fr.addEventListener( 'loadend', function() {
					if ( fileName in storedFiles ) {
						alert( 'There is an existing file with the same name! It will be overwritten.' );
					}
					storedFiles[ fileName ] = new Uint8Array( fr.result );
					pendingTagAttributes.push( [ 'attr', 'data-storedfile', fileName ] );

					if ( dashDashArg ) {
						fileName = ui.tagLabel + '="' + fileName + '"';
					}
					$cmd.tagit( 'createTag', fileName );
					$dlg.remove();
					$cmd.focus()
						.next()
						.find( '.tagit-new input' )
						.focus();
				} );
				fr.readAsArrayBuffer( f );
			} else {
				if ( dashDashArg ) {
					inputVal = ui.tagLabel + '="' + inputVal + '"';
				}
				$cmd.tagit( 'createTag', inputVal );
				$dlg.remove();
				$cmd.focus()
					.next()
					.find( '.tagit-new input' )
					.focus();
			}
		} );
		setTimeout( function() {
			$dlg.dialog( 'open' );
		}, 5 );
	}

	function cancelWorker( title ) {
		$workerDlg
			.dialog( {
				'closeOnEscape': true
			} )
			.dialog( 'widget' )
			.find( '.ui-dialog-titlebar' )
			.fadeIn( 'slow' );

		if ( title ) {
			$workerDlg.dialog( 'option', 'title', title );
		}
		$workerProgress.fadeOut( 'slow' );
		worker.terminate();
		worker = null;
	}

	function onWorkerMessage( e ) {
		/*jshint forin:false */
		var vals, fileName, blob, url, mime;

		if ( !e.data ) {
			return;
		}
		switch ( e.data.reply ) {
			case 'progress':
				vals = e.data.values;
				if ( vals[ 1 ] ) {
					$workerProgress.val( vals[ 0 ] / vals[ 1 ] * 100 );
				}
				break;
			case 'done':
				$workerProgress.val( 100 );

				for ( fileName in e.data.values ) {
					if ( !e.data.values.hasOwnProperty( fileName ) ) {
						return;
					}
					blob = e.data.values[fileName].blob;
					url = URL.createObjectURL( blob );

					$( '<a>' )
						.text( fileName )
						.hide()
						.prop( 'href', url )
						.attr( 'download', fileName )
						.attr( 'style', 'background: url("images/icon_download.png") no-repeat scroll left center transparent; padding-left: 28px;' )
						.appendTo( $downloads.show() )
						.fadeIn()
						.click( function( e ) {
							saveAs( blob, fileName );
							e.preventDefault();
						} )
						.click();

					mime = e.data.values[fileName].MIME;
					if (
						flacPlaybackSupported
						&& ( { 'audio/flac': 1, 'audio/ogg': 1 } )[mime]
						&& /\.(flac|oga)$/.test( fileName )
						|| wavPlaybackSupported
						&& mime === 'audio/wav'
						&& /\.wav$/.test( fileName )
					) {
						$downloads.append( ' ' );
						$testclip
							.clone()
							.attr( 'src', url )
							.removeClass( 'hidden' )
							.appendTo( $downloads )
							.show();
					}
					$downloads.append( '<br />' );
				}

				cancelWorker();
				break;
			case 'log':
				var lines = $.trim( e.data.values[ 0 ] ).replace( /\r/g, '\n' ),
					$lines;

				if ( /\nERROR\:/.test( lines ) || /^ERROR\:/.test( lines ) ) {
					err( lines );
					setTimeout( cancelWorker.bind( global, "Error" ), 1000 );
					return;
				}
				lines = lines.split( '\n' );
				$.each( lines, function( i, l ) {
					lines[i] = l.replace( /\s*$/, '' );
				} );
				lines = lines.join( '\n' ).replace( /\n+/g, '\n' );
				$lines = $info.clone().text( lines ).appendTo( $console );
				$console.clearQueue().animate({ scrollTop: $console.scrollTop() + $lines.position().top }, 800);
				break;
			case 'err':
				err( e.data.values[ 0 ] );
				setTimeout( cancelWorker.bind( global, "Error" ), 100 );
				break;
		}
	}
	
	$cmd.tagit( {
		placeholderText: 'Type `-´ for suggestions',
		availableTags: availableTags,
		removeConfirmation: true,
		allowDuplicates: true,
		afterTagAdded: validateTag,
		beforeTagRemoved: beforeRemovedTag,
		afterTagRemoved: showHideFileInput
	} );

	try {
		worker = new Worker( 'worker/EmsWorkerProxy.js' );
		worker.postMessage( {
			command: 'prefetch'
		} );
		worker.onmessage = onWorkerMessage;
	} catch ( ex ) {
		var $oeFileWarn = $( '.oe-file-warn' ),
			oeFileWarnText = $.trim( $oeFileWarn.eq( 0 ).text() );

		if ( 'file:' === location.protocol ) {
			$oeFileWarn.show();
			console.error( oeFileWarnText );
			err( oeFileWarnText );
		}
		console.error( ex );
		err( ex );
	}

	$button
		.button( {
			icons: {
				primary: 'ui-icon-arrowreturnthick-1-e'
			}
		} );

	function bindEvent( i, evt ) {
		$fileInput.on( evt, function() {
			$button.triggerHandler( evt );
		} );
	}

	$fileInput.change( prepareEncode.bind( global, undefined ) );
	$.each( [ 'focus', 'blur', 'mouseenter', 'mouseout', 'mousedown', 'mouseup' ], bindEvent );
	$button.click( function() {
		$fileInput.triggerHandler( 'change' );
	} );

	// Forward focus from command line fake console to input
	$( '#oe-command-line-options .oe-console' )
		.click( function() {
			$( '.tagit-new input' )
				.focus();
		} );

	__onSamplefileClick = function( e ) {
		var resource = $( this ).data( 'filename' ),
			xhr = new XMLHttpRequest(),
			$sampleDlDlg = $( '<div>' ),
			$sampleDlProg = $workerProgress
				.clone()
				.appendTo( $sampleDlDlg );

		e.preventDefault();

		xhr.open( 'GET', 'audio/' + resource, true );
		xhr.responseType = 'arraybuffer';

		$( xhr ).on( {
			load: function () {
				try {
					if ( xhr.response ) {
						// Let's fake a file
						var f = new Blob( [ xhr.response ] );
						f.name = resource;

						$sampleDlDlg
							.dialog( 'close' )
							.remove();

						prepareEncode( f );
					}
				} catch ( ex ) {
					$sampleDlDlg
						.text( ex.message || ex )
						.dialog( 'widget' )
						.find( '.ui-dialog-titlebar' )
						.show();
				}
			},
			progress: function( e ) {
				e = e.originalEvent;
				if ( !e.lengthComputable ) {
					return;
				}
				$sampleDlProg.val( 100 * e.loaded / e.total );
			},
			error: function() {
				$sampleDlDlg
					.text( 'Loading the sample failed.' )
					.dialog( 'widget' )
					.find( '.ui-dialog-titlebar' )
					.show();
			},
			abort: function() {
				$sampleDlDlg
					.text( 'Loading the sample aborted by you or your browser!' )
					.dialog( 'widget' )
					.find( '.ui-dialog-titlebar' )
					.show();
			}
		} );

		$sampleDlDlg.dialog( {
			'title': 'Downloading audio sample ...',
			'modal': true,
			'closeOnEscape': false,
			'width': 500,
			'open': function() {
				$( this )
					.dialog( 'widget' )
					.find( '.ui-dialog-titlebar' )
					.hide();
				$body.css( 'overflow', 'hidden' );
			},
			'close': function() {
				$body.removeAttr( 'style' );
			}
		} );
		xhr.send( null );
	};

	// Display sample audio files
	$sampleFileList = $( '#oe-sample-files-list' ).empty();
	$.each( global.audiosamples, function( name, info ) {
		var $li = $( '<li>' );

		$( '<a>' )
			.attr( 'href', '#!' + name )
			.attr( 'data-filename', name )
			.text( info.info + ', ' + info.size + ' MiB' )
			.click( __onSamplefileClick )
			.appendTo( $li );

		$li.append( '<br />' );

		if ( !info.supported ) {
			$( '<span>' )
				.addClass( 'ui-state-error' )
				.text( 'This file\'s format is not supported by Opusenc.js' )
				.appendTo( $li );

			$li.append( '<br />' );
		}

		if ( info.source && info.title ) {
			$( '<a>' )
				.attr( 'href', info.source || '' )
				.text( 'Source: ' + info.title || '' )
				.appendTo( $li );

			$li.append( '<br />' );
		}

		$( '<span>' )
			.addClass( 'oe-sample-file-copyright' )
			.html( info.copyright )
			.appendTo( $li );

		$li.appendTo( $sampleFileList );
	} );

	// No runtime error so far, so hide the warning
	$( '.oe-js-warn' ).hide();
	$( 'html' ).addClass( 'js' + ( window.WebAssembly ? ' webassembly' : '' ) );

	__onDragOver = function( e ) {
		e.preventDefault();
		$( this ).addClass( 'oe-acceptdrop' );
	};

	__onDropOrPaste = function( e ) {
		if ( !e.originalEvent.dataTransfer ) return;

		var f = e.originalEvent.dataTransfer.files[0];
		e.preventDefault();
		$( this ).removeClass( 'oe-acceptdrop' );

		if ( f ) prepareEncode( f );
	};

	// Implement drag & drop
	$body
		.on( {
			drop: __onDropOrPaste,
			paste: __onDropOrPaste,
			dragover: __onDragOver,
			dragleave: function () {
				$( this ).removeClass( 'oe-acceptdrop' );
			},
			dragend: function ( e ) {
				e.preventDefault();
				$( this ).removeClass( 'oe-acceptdrop' );
			}
		} );

	// Test audio support
	try {
		flacPlaybackSupported = 
			$testclip[0].canPlayType( 'audio/flac' )
			|| $testclip[0].canPlayType( 'audio/x-flac' )
			|| $testclip[0].canPlayType( 'audio/ogg; codecs="flac"' );

		wavPlaybackSupported =
			$testclip[0].canPlayType( 'audio/vnd.wave' )
			|| $testclip[0].canPlayType( 'audio/wav' )
			|| $testclip[0].canPlayType( 'audio/wave' )
			|| $testclip[0].canPlayType( 'audio/x-wav' );
	} catch ( ex ) {}
}( window ) );