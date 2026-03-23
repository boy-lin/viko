import React, { Suspense, lazy } from "react";
import { createHashRouter, Outlet, RouterProvider } from "react-router-dom";
import i18n from "@/lib/i18n";
import { APP_PATHS } from "@/config/navigation";
import RootLayout from "./layout/RootPage";
import AuthLayout from "./layout/AuthLayout";
import ErrorPage from '@/components/error/ErrorPage';

const HomePage = lazy(() => import("./pages/home"));
const TaskHistoryPage = lazy(() => import("./pages/tasks"));
const CompressorPage = lazy(() => import("./pages/compressor/CompressorPage"));

const DenoisePage = lazy(() => import("./pages/denoise"));
const ConverterPage = lazy(() => import("./pages/converter/ConverterPage"));
const MyFilesPage = lazy(() => import("./pages/myfiles"));
const MetadataEditorPage = lazy(() => import("./pages/metadata"));
const WatermarkPage = lazy(() => import("./pages/watermark"));
const ForceUpdatePage = lazy(() => import("./pages/force-update"));

const preloadI18nNamespaces = (namespaces: string[]) => async () => {
  await i18n.loadNamespaces(namespaces);
  return null;
};

const hydrateFallbackElement = (
  <div className="loader-wrapper">
    <div className="loader"></div>
  </div>
);
const withSuspense = (element: React.ReactNode) => (
  <Suspense fallback={hydrateFallbackElement}>
    {element}
  </Suspense>
);
const router = createHashRouter([
  {
    path: APP_PATHS.home,
    element: <AuthLayout />,
    errorElement: <ErrorPage />,
    hydrateFallbackElement,
    children: [
      {
        path: APP_PATHS.home,
        element: <RootLayout />,

        children: [
          {
            index: true,
            element: withSuspense(<HomePage />),
            loader: preloadI18nNamespaces(["home"])
          },
          {
            path: APP_PATHS.compressor.slice(1),
            loader: preloadI18nNamespaces(["task"]),
            element: withSuspense(<CompressorPage />),
          },
          {
            path: APP_PATHS.converter.slice(1),
            loader: preloadI18nNamespaces(["task"]),
            element: withSuspense(<ConverterPage />)
          },
          {
            path: APP_PATHS.denoise.slice(1),
            element: withSuspense(<DenoisePage />),
            loader: preloadI18nNamespaces(["task"]),
          },
          {
            path: "my",
            children: [{ path: "files", element: withSuspense(<MyFilesPage />) }],
          },
          {
            path: "tasks",
            element: <Outlet />,
            loader: preloadI18nNamespaces(["tasks"]),
            children: [
              { index: true, element: withSuspense(<TaskHistoryPage />) },
            ],
          },
          { path: APP_PATHS.metadata.slice(1), element: withSuspense(<MetadataEditorPage />), loader: preloadI18nNamespaces(["metadata"]) },
          { path: APP_PATHS.watermark.slice(1), element: withSuspense(<WatermarkPage />), loader: preloadI18nNamespaces(["watermark"]) },
        ],
      },
    ],
  },
  {
    path: APP_PATHS.forceUpdate,
    element: withSuspense(<ForceUpdatePage />),
    errorElement: <ErrorPage />,
    hydrateFallbackElement,
    loader: preloadI18nNamespaces(["common"])
  },
]);

const App: React.FC = () => {
  return <RouterProvider router={router} />;
};

export default App;

