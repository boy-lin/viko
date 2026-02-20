import React, { Suspense, lazy } from "react";
import { createBrowserRouter, Outlet, RouterProvider } from "react-router-dom";
import i18n from "@/lib/i18n";
import RootLayout from "./layout/RootPage";
import AuthLayout from "./layout/AuthLayout";
import ErrorPage from '@/components/error/ErrorPage';

const HomePage = lazy(() => import("./pages/home"));
const TaskListPage = lazy(() => import("./pages/tasks/TaskListPage"));
const TaskHistoryPage = lazy(() => import("./pages/tasks"));
const CompressorVideoPage = lazy(() => import("./pages/compressor/videos"));
const CompressorAudioPage = lazy(() => import("./pages/compressor/audios"));
const CompressorImagePage = lazy(() => import("./pages/compressor/images"));
const ConverterVideoPage = lazy(() => import("./pages/converter/videos"));
const ConverterAudioPage = lazy(() => import("./pages/converter/audios"));
const ConverterImagePage = lazy(() => import("./pages/converter/images"));
const Mp3ConverterPage = lazy(() => import("./pages/demo/converter"));
const AudioTestPage = lazy(() => import("./pages/demo/AudioTestPage"));
const VideoPlayerPage = lazy(() => import("./pages/demo/VideoPlayer"));
const MyFilesPage = lazy(() => import("./pages/myfiles"));
const SignInPage = lazy(() => import("./pages/auth/sign-in"));
const SignUpPage = lazy(() => import("./pages/auth/sign-up"));
const MetadataEditorPage = lazy(() => import("./pages/metadata"));
const WatermarkPage = lazy(() => import("./pages/watermark"));

const preloadI18nNamespaces = (namespaces: string[]) => async () => {
  await i18n.loadNamespaces(namespaces);
  return null;
};

const withSuspense = (element: React.ReactNode) => (
  <Suspense fallback={<div className="loader-wrapper">
    <div className="loader"></div>
  </div>}>
    {element}
  </Suspense>
);

const router = createBrowserRouter([
  {
    path: "/",
    element: <AuthLayout />,
    errorElement: <ErrorPage />,
    loader: preloadI18nNamespaces(["common"]),
    children: [
      {
        path: "/",
        element: <RootLayout />,
        children: [
          { index: true, element: withSuspense(<HomePage />), loader: preloadI18nNamespaces(["home"]) },
          {
            path: "compressor", element: <Outlet />, children: [
              { path: "videos", element: withSuspense(<CompressorVideoPage />), loader: preloadI18nNamespaces(["converter", "common"]) },
              { path: "audios", element: withSuspense(<CompressorAudioPage />), loader: preloadI18nNamespaces(["converter", "common"]) },
              { path: "images", element: withSuspense(<CompressorImagePage />), loader: preloadI18nNamespaces(["converter", "common"]) },
            ]
          },
          {
            path: "converter", element: <Outlet />, children: [
              { path: "videos", element: withSuspense(<ConverterVideoPage />), loader: preloadI18nNamespaces(["converter", "common"]) },
              { path: "audios", element: withSuspense(<ConverterAudioPage />), loader: preloadI18nNamespaces(["converter", "common"]) },
              { path: "images", element: withSuspense(<ConverterImagePage />), loader: preloadI18nNamespaces(["converter", "common"]) },
            ]
          },
          {
            path: "my",
            children: [{ path: "files", element: withSuspense(<MyFilesPage />) }],
          },
          {
            path: "tasks",
            element: <Outlet />,
            children: [
              { index: true, element: withSuspense(<TaskHistoryPage />) },
              { path: "convert", element: withSuspense(<TaskListPage mode="convert" />) },
              { path: "compress", element: withSuspense(<TaskListPage mode="compress" />) },
            ],
          },
          {
            path: "demo",
            children: [
              { path: "mp3", element: withSuspense(<Mp3ConverterPage />) },
              { path: "audio-test", element: withSuspense(<AudioTestPage />) },
              { path: "v1", element: withSuspense(<HomePage />) },
            ],
          },
          {
            children: [
              { path: "video-player", element: withSuspense(<VideoPlayerPage />) },
            ],
          },
          { path: "metadata", element: withSuspense(<MetadataEditorPage />) },
          { path: "watermark", element: withSuspense(<WatermarkPage />) },
        ],
      },
    ],
  },
  {
    path: "/sign-in", element: withSuspense(<SignInPage />),
    errorElement: <ErrorPage />,
    loader: preloadI18nNamespaces(["auth", "common"])
  },
  {
    path: "/sign-up", element: withSuspense(<SignUpPage />),
    errorElement: <ErrorPage />,
    loader: preloadI18nNamespaces(["auth", "common"])
  },
]);

const App: React.FC = () => {
  return <RouterProvider router={router} />;
};

export default App;
