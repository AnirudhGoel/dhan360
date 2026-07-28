import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Holdings from "./pages/Holdings";
import MutualFunds from "./pages/MutualFunds";
import StocksEtfs from "./pages/StocksEtfs";
import Rebalancing from "./pages/Rebalancing";
import Analytics from "./pages/Analytics";
import Transactions from "./pages/Transactions";
import Reports from "./pages/Reports";
import Imports from "./pages/Imports";
import Settings from "./pages/Settings";

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/holdings" element={<Holdings />} />
        <Route path="/mutual-funds" element={<MutualFunds />} />
        <Route path="/stocks-etfs" element={<StocksEtfs />} />
        <Route path="/rebalancing" element={<Rebalancing />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/imports" element={<Imports />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
