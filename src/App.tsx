import React from "react";
import { createBrowserRouter, Outlet, RouterProvider } from "react-router-dom";
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

const router = createBrowserRouter([
  {
    path: "/",
    element: <AuthLayout />,
    errorElement: <ErrorPage />,
    children: [
      {
        path: "/",
        element: <RootLayout />,
        children: [
          { index: true, element: <HomePage /> },
          {
            path: "compressor", element: <Outlet />, children: [
              { path: "videos", element: <CompressorVideoPage /> },
              { path: "audios", element: <CompressorAudioPage /> },
              { path: "images", element: <CompressorImagePage /> },
            ]
          },
          {
            path: "converter", element: <Outlet />, children: [
              { path: "videos", element: <ConverterVideoPage /> },
              { path: "audios", element: <ConverterAudioPage /> },
              { path: "images", element: <ConverterImagePage /> },
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
    errorElement: <ErrorPage />
  },
  {
    path: "/sign-up", element: <SignUpPage />,
    errorElement: <ErrorPage />
  },
]);

const App: React.FC = () => {
  return <RouterProvider router={router} />;
};

export default App;
