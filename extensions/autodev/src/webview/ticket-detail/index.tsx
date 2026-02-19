/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import React from 'react';
import { createRoot } from 'react-dom/client';
import { TicketDetail } from './TicketDetail';
import './ticket-detail.css';

const container = document.getElementById('root');
if (container) {
	const root = createRoot(container);
	root.render(<TicketDetail />);
}
