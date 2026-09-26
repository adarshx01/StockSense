import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { DashboardPage } from './pages/DashboardPage';
import { DocumentListPage } from './pages/DocumentListPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { LoginPage } from './pages/LoginPage';
import { MoveHistoryPage } from './pages/MoveHistoryPage';
import { OperationFormPage } from './pages/OperationFormPage';
import { ProductFormPage, ProductsPage } from './pages/ProductsPage';
import { ProfilePage } from './pages/ProfilePage';
import { LocationFormPage, LocationsPage, WarehouseFormPage, WarehousesPage } from './pages/SettingsPages';
import { SignupPage } from './pages/SignupPage';
import { StockPage } from './pages/StockPage';

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/receipts" element={<DocumentListPage kind="receipt" />} />
              <Route path="/receipts/new" element={<OperationFormPage kind="receipt" />} />
              <Route path="/receipts/:id" element={<OperationFormPage kind="receipt" />} />
              <Route path="/deliveries" element={<DocumentListPage kind="delivery" />} />
              <Route path="/deliveries/new" element={<OperationFormPage kind="delivery" />} />
              <Route path="/deliveries/:id" element={<OperationFormPage kind="delivery" />} />
              <Route path="/transfers" element={<DocumentListPage kind="transfer" />} />
              <Route path="/transfers/new" element={<OperationFormPage kind="transfer" />} />
              <Route path="/transfers/:id" element={<OperationFormPage kind="transfer" />} />
              <Route path="/adjustments" element={<DocumentListPage kind="adjustment" />} />
              <Route path="/adjustments/new" element={<OperationFormPage kind="adjustment" />} />
              <Route path="/adjustments/:id" element={<OperationFormPage kind="adjustment" />} />
              <Route path="/products" element={<ProductsPage />} />
              <Route path="/products/new" element={<ProductFormPage />} />
              <Route path="/products/:id" element={<ProductFormPage />} />
              <Route path="/stock" element={<StockPage />} />
              <Route path="/move-history" element={<MoveHistoryPage />} />
              <Route path="/settings/warehouses" element={<WarehousesPage />} />
              <Route path="/settings/warehouses/new" element={<WarehouseFormPage />} />
              <Route path="/settings/warehouses/:id" element={<WarehouseFormPage />} />
              <Route path="/settings/locations" element={<LocationsPage />} />
              <Route path="/settings/locations/new" element={<LocationFormPage />} />
              <Route path="/settings/locations/:id" element={<LocationFormPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Route>
        </Routes>
      </ToastProvider>
    </AuthProvider>
  );
}
