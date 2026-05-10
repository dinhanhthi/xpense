import { createBrowserRouter } from 'react-router-dom';
import { App } from './App';
import { PrintShell } from './PrintShell';
import { HomePage } from './pages/HomePage';
import { GroupPage } from './pages/GroupPage';
import { SharePage } from './pages/SharePage';
import { PrintGroupPage } from './pages/PrintGroupPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'g/:groupId', element: <GroupPage /> },
      { path: 'share', element: <SharePage /> },
    ],
  },
  {
    path: '/g/:groupId/print',
    element: <PrintShell />,
    children: [{ index: true, element: <PrintGroupPage /> }],
  },
]);
