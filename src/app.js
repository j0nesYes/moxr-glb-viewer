import * as THREE from 'three';
import WebGL from 'three/addons/capabilities/WebGL.js';
import { Viewer } from './viewer.js';
import { SimpleDropzone } from 'simple-dropzone';
import { Validator } from './validator.js';
import { Footer } from './components/footer';
import queryString from 'query-string';

window.THREE = THREE;
window.VIEWER = {};

if (!(window.File && window.FileReader && window.FileList && window.Blob)) {
	console.error('The File APIs are not fully supported in this browser.');
} else if (!WebGL.isWebGL2Available()) {
	console.error('WebGL is not supported in this browser.');
}

class App {
	/**
	 * @param  {Element} el
	 * @param  {Location} location
	 */
	constructor(el, location) {
		console.log("[App] Init");

		// Use the modern URL API for robust parsing.
		const url = new URL(location.href);
		const queryParams = url.searchParams;

		let modelUrl = '';

		// Only load a model if the "?file=" parameter is present.
		if (queryParams.has('file')) {
			const fileName = queryParams.get('file');
			modelUrl = `https://00224466.xyz/MOXR/Upload/${fileName}`;
			console.log(`[App] Loading model from 'file' parameter: ${modelUrl}`);

			try {
				// 1. Remove the file extension (e.g., ".glb")
				const nameWithoutExtension = fileName.slice(0, fileName.lastIndexOf('.'));

				// 2. Split the remaining string by the underscore "_"
				const parts = nameWithoutExtension.split('_');

				// 3. Get the last part of the resulting array (the creator's name)
				const creatorName = parts[parts.length - 1];

				// 4. NEW: Replace all hyphens with spaces for better readability
				const formattedCreatorName = creatorName.replaceAll('-', ' ');

				// 5. Create an element to show the title in the UI
				const titleElement = document.createElement('h1');
				titleElement.id = 'model-title';

				// 6. Set the content using the formatted name
				titleElement.innerHTML = `<span>Created by: </span>${formattedCreatorName}`;

				// 7. Add the new element to the top of the page
				document.body.prepend(titleElement);

			} catch (e) {
				console.error("Could not parse display name from filename:", fileName);
			}

		} else {
			console.log("[App] No 'file' parameter found in URL. No model will be loaded.");
		}
		
		this.options = {
			kiosk: Boolean(queryParams.kiosk),
			model: modelUrl || queryParams.model || '',
			preset: queryParams.preset || '',
			cameraPosition: queryParams.cameraPosition ? queryParams.cameraPosition.split(',').map(Number) : null,
		};
		
		this.el = el;
		this.viewer = null;
		this.viewerEl = null;
		this.spinnerEl = el.querySelector('.spinner');
		this.dropEl = el.querySelector('.dropzone');
		this.inputEl = el.querySelector('#file-input');
		this.validator = new Validator(el);

		this.createDropzone();
		this.hideSpinner();

		if (this.options.kiosk) {
			const headerEl = document.querySelector('header');
			if (headerEl) headerEl.style.display = 'none';
			console.log("[App] Kiosk mode enabled → hiding header");
		}

		if (this.options.model) {
			console.log("[App] Loading model:", this.options.model);
			this.view(this.options.model, '', new Map());
		}
	}

	/**
	 * Sets up the drag-and-drop controller.
	 */
	createDropzone() {
		const dropCtrl = new SimpleDropzone(this.dropEl, this.inputEl);
		dropCtrl.on('drop', ({ files }) => this.load(files));
		dropCtrl.on('dropstart', () => this.showSpinner());
		dropCtrl.on('droperror', () => this.hideSpinner());
	}

	/**
	 * Sets up the view manager.
	 * @return {Viewer}
	 */
	createViewer() {
		this.viewerEl = document.createElement('div');
		this.viewerEl.classList.add('viewer');
		this.dropEl.innerHTML = '';
		this.dropEl.appendChild(this.viewerEl);
		this.viewer = new Viewer(this.viewerEl, this.options);
		return this.viewer;
	}

	/**
	 * Loads a fileset provided by user action.
	 * @param  {Map<string, File>} fileMap
	 */
	load(fileMap) {
		let rootFile;
		let rootPath;
		Array.from(fileMap).forEach(([path, file]) => {
			if (file.name.match(/\.(gltf|glb)$/)) {
				rootFile = file;
				rootPath = path.replace(file.name, '');
			}
		});

		if (!rootFile) {
			this.onError('No .gltf or .glb asset found.');
		}

		this.view(rootFile, rootPath, fileMap);
	}

	/**
	 * Passes a model to the viewer, given file and resources.
	 * @param  {File|string} rootFile
	 * @param  {string} rootPath
	 * @param  {Map<string, File>} fileMap
	 */
	view(rootFile, rootPath, fileMap) {
		if (this.viewer) this.viewer.clear();

		const viewer = this.viewer || this.createViewer();

		const fileURL = typeof rootFile === 'string' ? rootFile : URL.createObjectURL(rootFile);

		const cleanup = () => {
			this.hideSpinner();
			if (typeof rootFile === 'object') URL.revokeObjectURL(fileURL);
		};

		viewer
			.load(fileURL, rootPath, fileMap)
			.catch((e) => this.onError(e))
			.then((gltf) => {
				// TODO: GLTFLoader parsing can fail on invalid files. Ideally,
				// we could run the validator either way.
				if (!this.options.kiosk) {
					this.validator.validate(fileURL, rootPath, fileMap, gltf);
				}
				cleanup();
			});
	}

	/**
	 * @param  {Error} error
	 */
	onError(error) {
		let message = (error || {}).message || error.toString();
		if (message.match(/ProgressEvent/)) {
			message = 'Unable to retrieve this file. Check JS console and browser network tab.';
		} else if (message.match(/Unexpected token/)) {
			message = `Unable to parse file content. Verify that this file is valid. Error: "${message}"`;
		} else if (error && error.target && error.target instanceof Image) {
			message = 'Missing texture: ' + error.target.src.split('/').pop();
		}
		window.alert(message);
		console.error(error);
	}

	showSpinner() {
		this.spinnerEl.style.display = '';
	}

	hideSpinner() {
		this.spinnerEl.style.display = 'none';
	}
}

document.body.innerHTML += Footer();

document.addEventListener('DOMContentLoaded', () => {
	// STEP 1: Make the container visible FIRST.
	const dropzoneElement = document.querySelector('.dropzone');
	if (dropzoneElement) {
		dropzoneElement.style.visibility = 'visible';
	}

	// STEP 2: NOW initialize the app.
	// The Viewer will be able to correctly measure the visible container.
	const app = new App(document.body, location);
	window.VIEWER.app = app;

	console.info('[glTF Viewer] Debugging data exported as `window.VIEWER`.');
});