/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// This module runs in the webview (browser) environment.
// acquireVsCodeApi() is a global injected by VS Code into every webview HTML page.

export interface VsCodeApi {
	postMessage(message: unknown): void;
	getState(): unknown;
	setState(state: unknown): void;
}

let _api: VsCodeApi | undefined;

/**
 * Returns the VS Code webview API singleton.
 * Must only be called once per webview lifetime — acquireVsCodeApi() throws if called twice.
 */
export function getVsCodeApi(): VsCodeApi {
	if (!_api) {
		_api = (globalThis as unknown as { acquireVsCodeApi(): VsCodeApi }).acquireVsCodeApi();
	}
	return _api;
}

/**
 * Sends a message to the VS Code extension host.
 */
export function postMessage(message: unknown): void {
	getVsCodeApi().postMessage(message);
}
