import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import HomePage from "./pages/home/v2";
import ModuleManagerPage from "./pages/modules/ModuleManagerPage";

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="modules" element={<ModuleManagerPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
};

export default App;
