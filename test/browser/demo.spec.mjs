import { test, expect } from '@playwright/test';
import { makeWav } from '../helpers/wav.mjs';

test( 'demo page (iframe.html) encodes a file selected by the user', async ( { page } ) => {
	await page.goto( '/iframe.html' );

	await page.locator( 'input[type=file]' ).setInputFiles( {
		name: 'recording.wav',
		mimeType: 'audio/wav',
		buffer: Buffer.from( makeWav( { frames: 44100 * 2 } ) )
	} );

	const link = page.locator( '#results a' );
	await expect( link ).toHaveText( 'recording.flac', { timeout: 30000 } );
	await expect( page.locator( 'progress' ) ).toHaveJSProperty( 'value', 100 );
	await expect( page.locator( 'input[type=file]' ) ).toBeEnabled();

	const magic = await link.evaluate( async ( a ) => {
		const bytes = new Uint8Array( await ( await fetch( a.href ) ).arrayBuffer() );
		return String.fromCharCode( ...bytes.subarray( 0, 4 ) );
	} );
	expect( magic ).toBe( 'fLaC' );
	await expect( page.locator( '#console' ) ).toContainText( 'recording.wav: wrote' );
} );

test( 'demo page decodes FLAC files', async ( { page } ) => {
	await page.goto( '/iframe.html' );
	const input = page.locator( 'input[type=file]' );

	await input.setInputFiles( {
		name: 'song.wav',
		mimeType: 'audio/wav',
		buffer: Buffer.from( makeWav( { frames: 22050 } ) )
	} );
	await expect( page.locator( '#results a' ) ).toHaveText( 'song.flac', { timeout: 30000 } );

	const flac = await page.locator( '#results a' ).evaluate( async ( a ) =>
		Array.from( new Uint8Array( await ( await fetch( a.href ) ).arrayBuffer() ) ) );

	await input.setInputFiles( {
		name: 'song.flac',
		mimeType: 'audio/flac',
		buffer: Buffer.from( flac )
	} );
	await expect( page.locator( '#results a' ).nth( 1 ) ).toHaveText( 'song.wav', { timeout: 30000 } );
} );
