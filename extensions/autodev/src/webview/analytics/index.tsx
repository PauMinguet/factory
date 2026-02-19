/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import React from 'react';
import { createRoot } from 'react-dom/client';
import { AnalyticsDashboard } from './AnalyticsDashboard';
import './analytics.css';

const container = document.getElementById('root');
if (container) {
	createRoot(container).render(<AnalyticsDashboard />);
}
