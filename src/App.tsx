/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { MainAI } from './MainAI';
import { WidgetAI } from './WidgetAI';
import { TabletRemote } from './TabletRemote';

export default function App() {
  const [route, setRoute] = useState(window.location.hash);

  useEffect(() => {
    const handleHashChange = () => setRoute(window.location.hash);
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  if (route === '#/widget') {
    return <WidgetAI />;
  }

  if (route === '#/tablet') {
    return <TabletRemote />;
  }

  return <MainAI />;
}
