import React, { Suspense, lazy } from "react";
import { createHashRouter, Outlet, RouterProvider } from "react-router-dom";
import i18n from "@/lib/i18n";
import RootLayout from "./layout/RootPage";
import AuthLayout from "./layout/AuthLayout";
import ErrorPage from '@/components/error/ErrorPage';

const HomePage = lazy(() => import("./pages/home"));
const TaskHistoryPage = lazy(() => import("./pages/tasks"));
const CompressorVideoPage = lazy(() => import("./pages/compressor/videos"));
const CompressorAudioPage = lazy(() => import("./pages/compressor/audios"));
const CompressorImagePage = lazy(() => import("./pages/compressor/images"));

const ConverterVideoPage = lazy(() => import("./pages/converter/videos"));
const ConverterAudioPage = lazy(() => import("./pages/converter/audios"));
const ConverterImagePage = lazy(() => import("./pages/converter/images"));

// const Mp3ConverterPage = lazy(() => import("./pages/demo/converter"));
// const AudioTestPage = lazy(() => import("./pages/demo/AudioTestPage"));
const MyFilesPage = lazy(() => import("./pages/myfiles"));
const SignInPage = lazy(() => import("./pages/auth/sign-in"));
const SignUpPage = lazy(() => import("./pages/auth/sign-up"));
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
    path: "/",
    element: <AuthLayout />,
    errorElement: <ErrorPage />,
    hydrateFallbackElement,
    children: [
      {
        path: "/",
        element: <RootLayout />,

        children: [
          {
            index: true,
            element: withSuspense(<HomePage />),
            loader: preloadI18nNamespaces(["home"])
          },
          {
            path: "compressor", element: <Outlet />,
            loader: preloadI18nNamespaces(["task"]),
            children: [
              { path: "videos", element: withSuspense(<CompressorVideoPage />) },
              { path: "audios", element: withSuspense(<CompressorAudioPage />) },
              { path: "images", element: withSuspense(<CompressorImagePage />) },
            ]
          },
          {
            path: "converter", element: <Outlet />,
            loader: preloadI18nNamespaces(["task"]),
            children: [
              { path: "videos", element: withSuspense(<ConverterVideoPage />) },
              { path: "audios", element: withSuspense(<ConverterAudioPage />) },
              { path: "images", element: withSuspense(<ConverterImagePage />) },
            ]
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
          // {
          //   path: "demo",
          //   children: [
          //     { path: "mp3", element: withSuspense(<Mp3ConverterPage />) },
          //     { path: "audio-test", element: withSuspense(<AudioTestPage />) },
          //   ],
          // },
          { path: "metadata", element: withSuspense(<MetadataEditorPage />), loader: preloadI18nNamespaces(["metadata"]) },
          { path: "watermark", element: withSuspense(<WatermarkPage />), loader: preloadI18nNamespaces(["watermark"]) },
        ],
      },
    ],
  },
  {
    path: "/sign-in", element: withSuspense(<SignInPage />),
    errorElement: <ErrorPage />,
    hydrateFallbackElement,
    loader: preloadI18nNamespaces(["auth", "common"])
  },
  {
    path: "/sign-up", element: withSuspense(<SignUpPage />),
    errorElement: <ErrorPage />,
    hydrateFallbackElement,
    loader: preloadI18nNamespaces(["auth", "common"])
  },
  {
    path: "/force-update",
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

