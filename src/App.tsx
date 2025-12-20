import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import HomePage from "./pages/home/v2";
import TaskListPage from "./pages/tasks/TaskListPage";
import BatchPage from "./pages/batch/BatchPage";

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="tasks" element={<TaskListPage />} />
          <Route path="batch" element={<BatchPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
};

export default App;
