import React from "react";
import { createBrowserRouter, Outlet, RouterProvider } from "react-router-dom";
import i18n from "@/lib/i18n";
import RootLayout from "./layout/RootPage";
import HomePage from "./pages/home";
import TaskListPage from "./pages/tasks/TaskListPage";
import CompressorVideoPage from "./pages/compressor/videos";
import CompressorAudioPage from "./pages/compressor/audios";
import CompressorImagePage from "./pages/compressor/images";
import ConverterVideoPage from "./pages/converter/videos";
import ConverterAudioPage from "./pages/converter/audios";
import ConverterImagePage from "./pages/converter/images";
import Mp3ConverterPage from "./pages/demo/converter";
import AudioTestPage from "./pages/demo/AudioTestPage";
import VideoPlayerPage from "./pages/demo/VideoPlayer";
import MyFilesPage from "./pages/myfiles";
import SignInPage from "./pages/auth/sign-in";
import SignUpPage from "./pages/auth/sign-up";
import AuthLayout from "./layout/AuthLayout";
import MetadataEditorPage from "./pages/metadata";
import WatermarkPage from "./pages/watermark";
import ErrorPage from '@/components/error/ErrorPage';

const preloadI18nNamespaces = (namespaces: string[]) => async () => {
  await i18n.loadNamespaces(namespaces);
  return null;
};

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
          { index: true, element: <HomePage />, loader: preloadI18nNamespaces(["home"]) },
          {
            path: "compressor", element: <Outlet />, children: [
              { path: "videos", element: <CompressorVideoPage />, loader: preloadI18nNamespaces(["converter", "common"]) },
              { path: "audios", element: <CompressorAudioPage />, loader: preloadI18nNamespaces(["converter", "common"]) },
              { path: "images", element: <CompressorImagePage />, loader: preloadI18nNamespaces(["converter", "common"]) },
            ]
          },
          {
            path: "converter", element: <Outlet />, children: [
              { path: "videos", element: <ConverterVideoPage />, loader: preloadI18nNamespaces(["converter", "common"]) },
              { path: "audios", element: <ConverterAudioPage />, loader: preloadI18nNamespaces(["converter", "common"]) },
              { path: "images", element: <ConverterImagePage />, loader: preloadI18nNamespaces(["converter", "common"]) },
            ]
          },
          {
            path: "my",
            children: [{ path: "files", element: <MyFilesPage /> }],
          },
          { path: "tasks", element: <TaskListPage /> },
          {
            path: "demo",
            children: [
              { path: "mp3", element: <Mp3ConverterPage /> },
              { path: "audio-test", element: <AudioTestPage /> },
              { path: "v1", element: <HomePage /> },
            ],
          },
          {
            children: [
              { path: "video-player", element: <VideoPlayerPage /> },
            ],
          },
          { path: "metadata", element: <MetadataEditorPage /> },
          { path: "watermark", element: <WatermarkPage /> },
        ],
      },
    ],
  },
  {
    path: "/sign-in", element: <SignInPage />,
    errorElement: <ErrorPage />,
    loader: preloadI18nNamespaces(["auth", "common"])
  },
  {
    path: "/sign-up", element: <SignUpPage />,
    errorElement: <ErrorPage />,
    loader: preloadI18nNamespaces(["auth", "common"])
  },
]);

const App: React.FC = () => {
  return <RouterProvider router={router} />;
};

export default App;
