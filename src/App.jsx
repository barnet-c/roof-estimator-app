// App shell: AuthProvider → QueryClientProvider → BrowserRouter → Routes.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";

import { AuthProvider } from "./auth/AuthProvider.jsx";
import RequireAuth from "./auth/RequireAuth.jsx";
import Home from "./pages/Home.jsx";
import Login from "./pages/Login.jsx";
import Confirmation from "./pages/Confirmation.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Logistics from "./pages/Logistics.jsx";
import NotFound from "./pages/NotFound.jsx";

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
});

export default function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/confirmation/:id" element={<Confirmation />} />
            <Route
              path="/dashboard"
              element={
                <RequireAuth>
                  <Dashboard />
                </RequireAuth>
              }
            />
            <Route
              path="/logistics"
              element={
                <RequireAuth>
                  <Logistics />
                </RequireAuth>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
          <Toaster richColors position="top-center" />
        </BrowserRouter>
      </QueryClientProvider>
    </AuthProvider>
  );
}
