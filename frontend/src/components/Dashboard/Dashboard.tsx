import React, { useEffect } from "react";
import { Grid } from "./Grid";
import { BrokerDashboard } from "./BrokerDashboard";
import { BrokerProfiles } from "./BrokerProfiles";
import { UserProfile } from "./UserProfile";
import { useAuth } from "@/context/AuthContext";
import dynamic from "next/dynamic";
import DealSheet from "../DealSheet/DealSheet";
import { canAccessPage, getDefaultPageForRole } from "@/lib/pageAccess";
import { useGoogleMapsLoader } from "@/hooks/useGoogleMapsLoader";

const MapProperties = dynamic(() => import("../Map/MapProperties"), {
  loading: () => null,
});
const Leasing = dynamic(() => import("../Leasing/Leasing").then((m) => m.Leasing), {
  loading: () => <div className="p-6 text-stone-600">Loading Leasing...</div>,
});
const Sales = dynamic(() => import("../Sales/Sales").then((m) => m.Sales), {
  loading: () => <div className="p-6 text-stone-600">Loading Sales...</div>,
});
const Sales2 = dynamic(() => import("../Sales/Sales2").then((m) => m.Sales2), {
  loading: () => <div className="p-6 text-stone-600">Loading Auction...</div>,
});
const PropertyFunds = dynamic(() => import("../PropertyFunds/PropertyFunds"), {
  loading: () => <div className="p-6 text-stone-600">Loading Property Funds...</div>,
});
const LegalDocs = dynamic(() => import("../LegalDocs/LegalDocs"), {
  loading: () => <div className="p-6 text-stone-600">Loading Legal Docs...</div>,
});
const Settings = dynamic(() => import("../Settings/Settings"), {
  loading: () => <div className="p-6 text-stone-600">Loading Settings...</div>,
});
const Reminders = dynamic(() => import("../Reminders/Reminders"), {
  loading: () => <div className="p-6 text-stone-600">Loading Reminder Calendar...</div>,
});
const Brochures = dynamic(() => import("../Brochures/Brochures").then((m) => m.Brochures), {
  loading: () => <div className="p-6 text-stone-600">Loading Brochures...</div>,
});

interface DashboardProps {
  currentPage?: string;
  onPageChange?: (page: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  currentPage = "Dashboard",
  onPageChange,
}) => {
  const { user } = useAuth();
  const defaultPage = getDefaultPageForRole(user?.role);
  useGoogleMapsLoader();

  useEffect(() => {
    void import("../Map/MapProperties");
    void import("../Map/GoogleMapWrapper");
  }, []);

  useEffect(() => {
    if (onPageChange && !canAccessPage(user?.role, currentPage)) {
      onPageChange(defaultPage);
    }
  }, [currentPage, defaultPage, onPageChange, user?.role]);

  const safePage = canAccessPage(user?.role, currentPage) ? currentPage : defaultPage;

  return (
    <div className="bg-white h-full overflow-y-auto">
      {safePage === "Dashboard" ? (
        <>
          {user?.role === "broker" ? <BrokerDashboard onPageChange={onPageChange} /> : <Grid />}
        </>
      ) : safePage === "Broker Profiles" ? (
        <div className="p-6">
          <BrokerProfiles />
        </div>
      ) : safePage === "Maps" ? (
        <MapProperties onPageChange={onPageChange} />
      ) : safePage === "Leasing" ? (
        <Leasing />
      ) : safePage === "Sales" ? (
        <Sales />
      ) : safePage === "Auction" ? (
        <Sales2 />
      ) : safePage === "Deal Sheet" ? (
        <div className="p-6">
          <DealSheet />
        </div>
      ) : safePage === "Property Funds" ? (
        <div className="p-6">
          <PropertyFunds />
        </div>
      ) : safePage === "Legal Docs" ? (
        <div className="p-6">
          <LegalDocs />
        </div>
      ) : safePage === "Reminders" ? (
        <div className="p-6">
          <Reminders />
        </div>
      ) : safePage === "Brochures" ? (
        <Brochures />
      ) : safePage === "Settings" ? (
        <div className="p-6">
          <Settings />
        </div>
      ) : safePage === "User Profile" ? (
        <UserProfile onBack={() => onPageChange?.("Dashboard")} />
      ) : (
        <div className="p-6">
          <p className="text-stone-600">Page under construction</p>
        </div>
      )}
    </div>
  );
};
