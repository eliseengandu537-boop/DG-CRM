// @ts-nocheck
import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { customRecordService } from "@/services/customRecordService";

type Row = {
  id: string;
  
  // Auction fields
  auctionDate?: string;
  from?: string;
  auctionType?: string;
  lotNumber?: string;
  biddersNumber?: string;
  seller?: string;
  area?: string;
  propertyAddress?: string;
  category?: string;
  company?: string;
  
  // Contact fields (generic, used by many sections)
  name?: string;
  surname?: string;
  email?: string;
  cell?: string;
  tel?: string;
  broker?: string;
  comment?: string;
  
  // Buyers Looking fields
  zoning?: string;
  size?: string;
  description?: string;
  price?: string;
  contactNumber?: string;
  comments?: string;
  // Mike Cohen specific
  dateAdded?: string;
  sellerName?: string;
  
  // Freight fields
  propertyName?: string;
  googleLink?: string;
  address?: string;
  registrationNo?: string;
  ownerNumber?: string;
  tenantsNo?: string;
  brokersCommentsDate?: string;
  brokersComments?: string;
  
  // Retail fields
  type?: string;
  googleMapLink?: string;
  entity?: string;
  ownerNameSurname?: string;
  number?: string;
  
  // Pick n Pay specific
  registeredCompanyName?: string;
  ownerName?: string;
  cellphoneNo?: string;
  brokerComment?: string;
  
  // Generic fields used by multiple sections
  registrationNumber?: string;
  contactName?: string;
  contactNumber?: string;
  // Cape Town specific / generic
  brand?: string;
  suburb?: string;
  contactNumberEmail?: string;
  operatorLandline?: string;
};

const sections: string[] = [
  "Auction contact list",
  "Potential B&S",
  "Buyers Looking",
  "Freight",
  "Retail",
  "Pick n Pay",
  "Shoprite",
  "Woolworths",
  "Food Lovers",
  "Spar",
  "Checkers",
  "Game",
  
  "Boxer sites",
  "Makro",
  "Cash Builds",
  "Build it",
  "Jacks hardware",
  "Builders Warehouse",
  "Mica",
  "Buco",
  "Virgin Active",
  "Industrial",
  "Commercial",
  "Petrol Stations",
  "Gauteng Petrol Stations",
  "Liquor Stores",
  "KFC",
  "Mixed-use Building",
  "Cash & Carry’s",
  "Golf Courses & Country Clubs",
  "Sectional Title",
  "Land",
  "Investors",
  "Residential",
  "Developers",
  "Hospitality",
  "Schools & Education",
  "Student Acc",
  "Churches",
  "Medical",
  "Muslim contacts",
  "OWNERS- MIC",
  "Broil Directors",
  "Mike Cohen- BUYERS & SELLERS",
  "Jewish contacts",
  "Cape Town- DAYNA",
  "Leroy Merlin",
];

const CANVASSING_ENTITY = "canvassing";

function toRowFromPayload(record: any): Row | null {
  if (!record) return null;
  const payload = record.payload && typeof record.payload === "object" && !Array.isArray(record.payload)
    ? record.payload
    : {};

  return {
    id: String(record.id || payload.id || `${Date.now()}`),
    ...(payload as Omit<Row, "id">),
  };
}

async function loadAllCanvassingRows(): Promise<Record<string, Row[]>> {
  const result = await customRecordService.getAllCustomRecords<Record<string, unknown>>({
    entityType: CANVASSING_ENTITY,
    limit: 1000,
  });

  const initial: Record<string, Row[]> = {};
  sections.forEach((section) => {
    initial[section] = [];
  });

  result.data.forEach((record) => {
    const section = String(record.category || "").trim();
    if (!section || !sections.includes(section)) return;
    const row = toRowFromPayload(record);
    if (!row) return;
    initial[section] = [...(initial[section] || []), row];
  });

  return initial;
}

type ColumnConfig = {
  key: keyof Row;
  label: string;
}[];

const getColumnConfig = (section: string): ColumnConfig => {
  const buyersLooking: ColumnConfig = [
    { key: "area", label: "Area" },
    { key: "category", label: "Category" },
    { key: "zoning", label: "Zoning" },
    { key: "size", label: "Size" },
    { key: "description", label: "Description" },
    { key: "company", label: "Company" },
    { key: "price", label: "Price" },
    { key: "name", label: "Name" },
    { key: "surname", label: "Surname" },
    { key: "email", label: "Email" },
    { key: "contactNumber", label: "Contact Number" },
    { key: "comments", label: "Comments" },
  ];

  const freight: ColumnConfig = [
    { key: "area", label: "Area" },
    { key: "propertyName", label: "Property Name" },
    { key: "googleLink", label: "Google Link" },
    { key: "address", label: "Address" },
    { key: "company", label: "Company Name" },
    { key: "registrationNo", label: "Registration No." },
    { key: "ownerNumber", label: "Owner Number" },
    { key: "tenantsNo", label: "Tenants No." },
    { key: "email", label: "Email" },
    { key: "brokersCommentsDate", label: "Brokers Comments & Date" },
    { key: "brokersComments", label: "Brokers Comments" },
  ];

  const retail: ColumnConfig = [
    { key: "type", label: "Type" },
    { key: "area", label: "Area" },
    { key: "googleMapLink", label: "Google Map Link" },
    { key: "entity", label: "Entity" },
    { key: "address", label: "Address" },
    { key: "company", label: "Company Name" },
    { key: "registrationNo", label: "Registration No." },
    { key: "ownerNameSurname", label: "Owner Name & Surname" },
    { key: "number", label: "Number" },
    { key: "email", label: "Email" },
    { key: "comment", label: "Comment" },
  ];

  const pickNPay: ColumnConfig = [
    { key: "area", label: "Area" },
    { key: "entity", label: "Entity" },
    { key: "googleLink", label: "Google Link" },
    { key: "address", label: "Address" },
    { key: "registeredCompanyName", label: "Registered Company Name" },
    { key: "registrationNo", label: "Registration No." },
    { key: "ownerName", label: "Owner Name" },
    { key: "cellphoneNo", label: "Cellphone No." },
    { key: "email", label: "Email" },
    { key: "brokerComment", label: "Broker Comment" },
  ];

  const standard: ColumnConfig = [
    { key: "area", label: "Area" },
    { key: "entity", label: "Entity" },
    { key: "googleLink", label: "Google Link" },
    { key: "address", label: "Address" },
    { key: "registeredCompanyName", label: "Registered Company Name" },
    { key: "registrationNo", label: "Registration No." },
    { key: "contactName", label: "Contact Name" },
    { key: "contactNumber", label: "Contact Number" },
    { key: "email", label: "Email" },
    { key: "comments", label: "Comments" },
  ];

  const mikeCohen: ColumnConfig = [
    { key: "dateAdded", label: "Date Added" },
    { key: "area", label: "Area" },
    { key: "address", label: "Address" },
    { key: "description", label: "Description" },
    { key: "sellerName", label: "Seller Name" },
    { key: "contactNumber", label: "Contact #" },
    { key: "email", label: "Email" },
  ];

  const medical: ColumnConfig = [
    { key: "type", label: "Type" },
    { key: "area", label: "Area" },
    { key: "name", label: "Name" },
    { key: "address", label: "Address" },
    { key: "googleMapLink", label: "Google Map Link" },
    { key: "company", label: "Company Name" },
    { key: "registrationNo", label: "Registration No." },
    { key: "contactName", label: "Contact Name" },
    { key: "email", label: "Email" },
    { key: "number", label: "Number" },
    { key: "brokersCommentsDate", label: "Broker Comments & Date" },
  ];

  const capeTown: ColumnConfig = [
    { key: "brand", label: "Brand" },
    { key: "area", label: "Area" },
    { key: "suburb", label: "Suburb" },
    { key: "address", label: "Address" },
    { key: "entity", label: "Entity" },
    { key: "registrationNo", label: "Reg No." },
    { key: "contactName", label: "Contact Name" },
    { key: "contactNumberEmail", label: "Contact Number / Email" },
    { key: "comment", label: "Comments" },
    { key: "operatorLandline", label: "Operator Landline" },
  ];

  switch (section) {
    case "Buyers Looking":
      return buyersLooking;
    case "Freight":
      return freight;
    case "Retail":
      return retail;
    case "Pick n Pay":
      return pickNPay;
    case "Shoprite":
    case "Woolworths":
    case "Food Lovers":
    case "Spar":
    case "Checkers":
    case "Game":
    case "Boxer sites":
    case "Makro":
    case "Cash Builds":
    case "Build it":
    case "Jacks hardware":
    case "Builders Warehouse":
    case "Mica":
    case "Buco":
    case "Virgin Active":
    case "Industrial":
    case "Commercial":
    case "Petrol Stations":
    case "Gauteng Petrol Stations":
    case "Liquor Stores":
    case "KFC":
    case "Mixed-use Building":
    case "Cash & Carry's":
    case "Golf Courses & Country Clubs":
    case "Sectional Title":
    case "Land":
    case "Investors":
    case "Residential":
    case "Developers":
    case "Hospitality":
    case "Schools & Education":
    case "Student Acc":
    case "Churches":
      return standard;
    case "Medical":
      return medical;
    case "Cape Town- DAYNA":
      return capeTown;
    case "Mike Cohen- BUYERS & SELLERS":
      return mikeCohen;
    default:
      return [
        { key: "name", label: "Name" },
        { key: "surname", label: "Surname" },
        { key: "email", label: "Email" },
        { key: "cell", label: "Cell" },
        { key: "tel", label: "Tel" },
        { key: "broker", label: "Broker" },
        { key: "comment", label: "Comment" },
      ];
  }
};

const CoreTables: React.FC<{ globalQuery?: string }> = ({ globalQuery }) => {
  const [data, setData] = useState<Record<string, Row[]>>({});
  const [search, setSearch] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<{ section: string; row?: Row } | null>(null);
  const [adding, setAdding] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    void loadAllCanvassingRows()
      .then((initial) => {
        if (!mounted) return;
        setData(initial);
      })
      .catch(() => {
        if (!mounted) return;
        const fallback: Record<string, Row[]> = {};
        sections.forEach((s) => {
          fallback[s] = [];
        });
        setData(fallback);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const saveRowRecord = async (section: string, row: Row, isNew: boolean) => {
    const payload = { ...row } as Record<string, unknown>;
    delete payload.id;

    if (isNew) {
      const created = await customRecordService.createCustomRecord({
        entityType: CANVASSING_ENTITY,
        category: section,
        name: String(row.name || row.company || row.propertyAddress || section),
        referenceId: String(row.email || row.contactName || row.propertyAddress || row.name || ""),
        payload,
      });
      const mapped = toRowFromPayload(created);
      if (!mapped) throw new Error("Failed to create canvassing row.");
      setData((prev) => ({ ...prev, [section]: [...(prev[section] || []), mapped] }));
      return;
    }

    await customRecordService.updateCustomRecord(row.id, {
      entityType: CANVASSING_ENTITY,
      category: section,
      name: String(row.name || row.company || row.propertyAddress || section),
      referenceId: String(row.email || row.contactName || row.propertyAddress || row.name || ""),
      payload,
    });
    setData((prev) => ({
      ...prev,
      [section]: (prev[section] || []).map((r) => (r.id === row.id ? row : r)),
    }));
  };

  const addRow = async (section: string, row: Omit<Row, "id">) => {
    const newRow: Row = { id: `${Date.now()}`, ...row };
    await saveRowRecord(section, newRow, true);
    setAdding(null);
  };

  const updateRow = async (section: string, row: Row) => {
    await saveRowRecord(section, row, false);
    setEditing(null);
  };

  const deleteRow = async (section: string, id: string) => {
    if (!confirm("Delete this row?")) return;
    await customRecordService.deleteCustomRecord(id);
    setData((prev) => ({
      ...prev,
      [section]: (prev[section] || []).filter((r) => r.id !== id),
    }));
  };

  const filtered = (section: string) => {
    const rows = data[section] || [];
    const globalQ = (globalQuery || "").toLowerCase().trim();
    if (globalQ) {
      return rows.filter((r) => {
        const allText = [
          r.name, r.surname, r.email, r.cell, r.tel, r.broker, r.comment,
          r.auctionDate, r.from, r.auctionType, r.lotNumber, r.biddersNumber, r.seller, r.area, r.propertyAddress, r.category, r.company,
          r.dateAdded, r.description, r.sellerName, r.address, r.contactNumber, r.brand, r.suburb, r.contactNumberEmail, r.operatorLandline
        ].filter(Boolean).join(" ").toLowerCase();
        return allText.includes(globalQ);
      });
    }
    const q = (search[section] || "").toLowerCase().trim();
    if (!q) return rows;
    return rows.filter((r) => {
      const allText = [
        r.name, r.surname, r.email, r.cell, r.tel, r.broker, r.comment,
        r.auctionDate, r.from, r.auctionType, r.lotNumber, r.biddersNumber, r.seller, r.area, r.propertyAddress, r.category, r.company,
        r.dateAdded, r.description, r.sellerName, r.address, r.contactNumber, r.brand, r.suburb, r.contactNumberEmail, r.operatorLandline
      ].filter(Boolean).join(" ").toLowerCase();
      return allText.includes(q);
    });
  };

  const slug = (s: string) => `canvassing_${s.replace(/[^a-z0-9]/gi, "_")}`;

  const globalMatches = () => {
    const q = (globalQuery || "").toLowerCase().trim();
    if (!q) return [] as { section: string; row: Row }[];
    const results: { section: string; row: Row }[] = [];
    sections.forEach((section) => {
      (data[section] || []).forEach((row) => {
        if ((row.name || "").toLowerCase().includes(q)) {
          results.push({ section, row });
        }
      });
    });
    return results;
  };

  const matches = globalMatches();

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {globalQuery && (
        <div className="bg-white rounded-lg border border-stone-200 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-md font-semibold">Search results ({matches.length})</h4>
            <div className="text-sm text-stone-500">Showing name matches across all sections</div>
          </div>
          {matches.length === 0 ? (
            <div className="text-stone-500">No matches found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-stone-50 border-b border-stone-200">
                  <tr>
                    <th className="px-4 py-2 text-sm font-semibold">Section</th>
                    <th className="px-4 py-2 text-sm font-semibold">Description</th>
                    <th className="px-4 py-2 text-sm font-semibold">Details</th>
                    <th className="px-4 py-2 text-sm font-semibold text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {matches.map(({ section, row }) => (
                    <tr key={`${section}_${row.id}`} className="border-t border-stone-200 hover:bg-stone-50 transition-colors bg-white">
                      <td className="px-4 py-4 text-sm text-stone-700">{section}</td>
                      <td className="px-4 py-4 text-sm text-stone-900">
                        {section === "Auction" ? row.propertyAddress : section === "Auction contact list" ? row.propertyAddress + " - " + row.name : row.name}
                      </td>
                      <td className="px-4 py-4 text-sm text-stone-700">
                        {section === "Auction" ? row.seller : section === "Auction contact list" ? row.email : row.email}
                      </td>
                      <td className="px-4 py-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => setEditing({ section, row })}
                            className="text-violet-500 hover:text-violet-700"
                            title="Edit"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => deleteRow(section, row.id)}
                            className="text-red-500 hover:text-red-700"
                            title="Delete"
                          >
                            🗑️
                          </button>
                          <button
                            onClick={() => {
                              const el = document.getElementById(slug(section));
                              if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                            }}
                            className="text-stone-600 hover:text-stone-800"
                            title="Jump to section"
                          >
                            ⤴️
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {sections.map((section) => (
        <div id={slug(section)} key={section} className="bg-white rounded-xl border border-stone-200 shadow">
          <div className="p-4 border-b border-stone-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold text-stone-900">{section}</h3>
              <div className="text-sm text-stone-500">{getColumnConfig(section).length} columns</div>
            </div>
            <div className="flex items-center gap-3 w-full md:w-auto">
              <div className="relative flex-1 md:flex-none">
                <svg className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-4.35-4.35"/><circle cx="11" cy="11" r="6" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"/></svg>
                <input
                  value={search[section] || ""}
                  onChange={(e) => setSearch((s) => ({ ...s, [section]: e.target.value }))}
                  placeholder="Search..."
                  className="pl-10 pr-3 py-2 w-full md:w-64 rounded-lg border border-stone-200 text-sm bg-stone-50 focus:outline-none focus:ring-2 focus:ring-violet-200"
                />
              </div>
              <button
                onClick={() => setAdding(section)}
                className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white px-3 py-2 rounded-lg text-sm shadow-sm"
              >
                <span className="font-medium">+ Add</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto p-4">
            <table className="min-w-full divide-y divide-stone-200 text-sm">
              <thead className="bg-stone-50 border-b border-stone-200 sticky top-0 z-10">
                <tr>
                  {section === "Auction" ? (
                    <>
                      <th className="px-4 py-2 text-sm font-semibold">Auction Date</th>
                      <th className="px-4 py-2 text-sm font-semibold">From</th>
                      <th className="px-4 py-2 text-sm font-semibold">Auction/Tender</th>
                      <th className="px-4 py-2 text-sm font-semibold">Lot #</th>
                      <th className="px-4 py-2 text-sm font-semibold">Bidders #</th>
                      <th className="px-4 py-2 text-sm font-semibold">Seller</th>
                      <th className="px-4 py-2 text-sm font-semibold">Area</th>
                      <th className="px-4 py-2 text-sm font-semibold">Property Address</th>
                      <th className="px-4 py-2 text-sm font-semibold">Category</th>
                      <th className="px-4 py-2 text-sm font-semibold">Company</th>
                    </>
                  ) : section === "Auction contact list" ? (
                    <>
                      <th className="px-4 py-2 text-sm font-semibold">Auction Date</th>
                      <th className="px-4 py-2 text-sm font-semibold">From</th>
                      <th className="px-4 py-2 text-sm font-semibold">Auction/Tender/Private Treaty</th>
                      <th className="px-4 py-2 text-sm font-semibold">Lot #</th>
                      <th className="px-4 py-2 text-sm font-semibold">Bidders #</th>
                      <th className="px-4 py-2 text-sm font-semibold">Seller</th>
                      <th className="px-4 py-2 text-sm font-semibold">Area</th>
                      <th className="px-4 py-2 text-sm font-semibold">Property Address</th>
                      <th className="px-4 py-2 text-sm font-semibold">Category</th>
                      <th className="px-4 py-2 text-sm font-semibold">Company</th>
                      <th className="px-4 py-2 text-sm font-semibold">Name</th>
                      <th className="px-4 py-2 text-sm font-semibold">Surname</th>
                      <th className="px-4 py-2 text-sm font-semibold">Email</th>
                      <th className="px-4 py-2 text-sm font-semibold">Cell</th>
                      <th className="px-4 py-2 text-sm font-semibold">Tel</th>
                      <th className="px-4 py-2 text-sm font-semibold">Broker</th>
                      <th className="px-4 py-2 text-sm font-semibold">Comment</th>
                    </>
                  ) : (
                    getColumnConfig(section).map((col) => (
                      <th key={col.key} className="px-4 py-2 text-sm font-semibold">
                        {col.label}
                      </th>
                    ))
                  )}
                  <th className="px-6 py-3 text-sm font-semibold text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(filtered(section) || []).map((row) => (
                  <tr key={row.id} className="border-t border-stone-200 hover:bg-violet-50 transition-colors bg-white">
                    {section === "Auction" ? (
                      <>
                        <td className="px-4 py-4 text-sm text-stone-900">{row.auctionDate}</td>
                        <td className="px-4 py-4 text-sm text-stone-700">{row.from}</td>
                        <td className="px-4 py-4 text-sm text-stone-700">{row.auctionType}</td>
                        <td className="px-4 py-4 text-sm text-stone-700">{row.lotNumber}</td>
                        <td className="px-4 py-4 text-sm text-stone-700">{row.biddersNumber}</td>
                        <td className="px-4 py-4 text-sm text-stone-700">{row.seller}</td>
                        <td className="px-4 py-4 text-sm text-stone-700">{row.area}</td>
                        <td className="px-4 py-4 text-sm text-stone-700">{row.propertyAddress}</td>
                        <td className="px-4 py-4 text-sm text-stone-700">{row.category}</td>
                        <td className="px-4 py-4 text-sm text-stone-700">{row.company}</td>
                      </>
                    ) : section === "Auction contact list" ? (
                      <>
                        <td className="px-4 py-4 text-sm text-stone-700">{row.auctionDate}</td>
                        <td className="px-4 py-4 text-sm text-stone-700">{row.from}</td>
                        <td className="px-4 py-4 text-sm text-stone-700">{row.auctionType}</td>
                        <td className="px-4 py-4 text-sm text-stone-700">{row.lotNumber}</td>
                        <td className="px-4 py-4 text-sm text-stone-700">{row.biddersNumber}</td>
                        <td className="px-4 py-4 text-sm text-stone-700">{row.seller}</td>
                        <td className="px-4 py-4 text-sm text-stone-700">{row.area}</td>
                        <td className="px-4 py-4 text-sm text-stone-700">{row.propertyAddress}</td>
                        <td className="px-4 py-4 text-sm text-stone-700">{row.category}</td>
                        <td className="px-4 py-4 text-sm text-stone-700">{row.company}</td>
                        <td className="px-4 py-4 text-sm text-stone-900">{row.name}</td>
                        <td className="px-4 py-4 text-sm text-stone-700">{row.surname}</td>
                        <td className="px-4 py-4 text-sm text-stone-700">{row.email}</td>
                        <td className="px-4 py-4 text-sm text-stone-700">{row.cell}</td>
                        <td className="px-4 py-4 text-sm text-stone-700">{row.tel}</td>
                        <td className="px-4 py-4 text-sm text-stone-700">{row.broker}</td>
                        <td className="px-4 py-4 text-sm text-stone-700">{row.comment}</td>
                      </>
                    ) : (
                      getColumnConfig(section).map((col) => (
                        <td key={col.key} className="px-4 py-4 text-sm text-stone-700">
                          {row[col.key] as any}
                        </td>
                      ))
                    )}
                    <td className="px-6 py-4 text-center">
                      <div className="flex justify-center gap-2">
                        <button
                          onClick={() => setEditing({ section, row })}
                          className="inline-flex items-center justify-center w-9 h-9 rounded-md bg-white border border-stone-100 hover:bg-violet-50 text-violet-600"
                          title="Edit"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => deleteRow(section, row.id)}
                          className="inline-flex items-center justify-center w-9 h-9 rounded-md bg-white border border-stone-100 hover:bg-red-50 text-red-600"
                          title="Delete"
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {(!data[section] || data[section].length === 0) && (
                  <tr>
                    <td
                      className="px-6 py-8 text-sm text-stone-700"
                      colSpan={
                        section === "Auction"
                          ? 11
                          : section === "Auction contact list"
                          ? 18
                          : getColumnConfig(section).length + 1
                      }
                    >
                      <div className="text-stone-500">No records. Use import or add to populate this table.</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Adding/editing now handled in modal */}
        </div>
      ))}

      {adding && (
        <Modal onClose={() => setAdding(null)}>
          <div className="p-4">
            <h3 className="text-lg font-semibold mb-2">Add — {adding}</h3>
            <RowForm
              section={adding}
              onCancel={() => setAdding(null)}
              onSave={(r) => addRow(adding, r)}
            />
          </div>
        </Modal>
      )}

      {editing?.section && editing.row && (
        <Modal onClose={() => setEditing(null)}>
          <div className="p-4">
            <h3 className="text-lg font-semibold mb-2">Edit — {editing.section}</h3>
            <RowForm
              section={editing.section}
              initial={editing.row}
              onCancel={() => setEditing(null)}
              onSave={(r) => updateRow(editing.section, { id: editing.row!.id, ...r })}
            />
          </div>
        </Modal>
      )}
    </div>
  );
};

const Modal: React.FC<{ onClose: () => void; children?: React.ReactNode }> = ({ onClose, children }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const el = (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-3xl mx-4">
        <div className="bg-white rounded-lg shadow-lg">{children}</div>
      </div>
    </div>
  );

  return createPortal(el, document.body);
};

const RowForm: React.FC<{
  section?: string;
  initial?: Partial<Row>;
  onCancel: () => void;
  onSave: (row: Omit<Row, "id">) => void;
}> = ({ section = "", initial = {}, onCancel, onSave }) => {
  const [formState, setFormState] = useState<Partial<Row>>(initial);
  const columns = getColumnConfig(section);

  const handleChange = (key: keyof Row, value: string) => {
    setFormState((prev) => ({ ...prev, [key]: value }));
  };

  const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const handleSave = () => {
    // basic email validation if email field present
    const emailVal = (formState.email || "").trim();
    if (emailVal && !isValidEmail(emailVal)) {
      alert("Please enter a valid email address.");
      return;
    }
    onSave(formState);
  };

  // Special handling for Auction
  if (section === "Auction") {
    return (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <input type="date" className="px-3 py-2 border rounded" placeholder="Auction Date" value={formState.auctionDate || ""} onChange={(e) => handleChange("auctionDate", e.target.value)} />
        <input className="px-3 py-2 border rounded" placeholder="From" value={formState.from || ""} onChange={(e) => handleChange("from", e.target.value)} />
        <input className="px-3 py-2 border rounded" placeholder="Auction/Tender" value={formState.auctionType || ""} onChange={(e) => handleChange("auctionType", e.target.value)} />
        <input className="px-3 py-2 border rounded" placeholder="Lot #" value={formState.lotNumber || ""} onChange={(e) => handleChange("lotNumber", e.target.value)} />
        <input type="number" className="px-3 py-2 border rounded" placeholder="Bidders #" value={formState.biddersNumber || ""} onChange={(e) => handleChange("biddersNumber", e.target.value)} />
        <input className="px-3 py-2 border rounded" placeholder="Seller" value={formState.seller || ""} onChange={(e) => handleChange("seller", e.target.value)} />
        <input className="px-3 py-2 border rounded" placeholder="Area" value={formState.area || ""} onChange={(e) => handleChange("area", e.target.value)} />
        <input className="col-span-1 md:col-span-4 px-3 py-2 border rounded" placeholder="Property Address" value={formState.propertyAddress || ""} onChange={(e) => handleChange("propertyAddress", e.target.value)} />
        <input className="px-3 py-2 border rounded" placeholder="Category" value={formState.category || ""} onChange={(e) => handleChange("category", e.target.value)} />
        <input className="px-3 py-2 border rounded" placeholder="Company" value={formState.company || ""} onChange={(e) => handleChange("company", e.target.value)} />
        <div className="col-span-1 md:col-span-4 flex gap-2 justify-end">
          <button onClick={onCancel} className="px-3 py-2 rounded border">Cancel</button>
          <button onClick={handleSave} className="px-3 py-2 rounded bg-violet-500 text-white">Save</button>
        </div>
      </div>
    );
  }

  // Special handling for Auction contact list
  if (section === "Auction contact list") {
    return (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <h4 className="col-span-1 md:col-span-4 font-semibold text-stone-800 mb-2">Auction Details</h4>
        <input className="px-3 py-2 border rounded" placeholder="Auction Date" value={formState.auctionDate || ""} onChange={(e) => handleChange("auctionDate", e.target.value)} />
        <input className="px-3 py-2 border rounded" placeholder="From" value={formState.from || ""} onChange={(e) => handleChange("from", e.target.value)} />
        <input className="px-3 py-2 border rounded" placeholder="Auction/Tender/Private Treaty" value={formState.auctionType || ""} onChange={(e) => handleChange("auctionType", e.target.value)} />
        <input className="px-3 py-2 border rounded" placeholder="Lot #" value={formState.lotNumber || ""} onChange={(e) => handleChange("lotNumber", e.target.value)} />
        <input className="px-3 py-2 border rounded" placeholder="Bidders #" value={formState.biddersNumber || ""} onChange={(e) => handleChange("biddersNumber", e.target.value)} />
        <input className="px-3 py-2 border rounded" placeholder="Seller" value={formState.seller || ""} onChange={(e) => handleChange("seller", e.target.value)} />
        <input className="px-3 py-2 border rounded" placeholder="Area" value={formState.area || ""} onChange={(e) => handleChange("area", e.target.value)} />
        <input className="col-span-1 md:col-span-4 px-3 py-2 border rounded" placeholder="Property Address" value={formState.propertyAddress || ""} onChange={(e) => handleChange("propertyAddress", e.target.value)} />
        <input className="px-3 py-2 border rounded" placeholder="Category" value={formState.category || ""} onChange={(e) => handleChange("category", e.target.value)} />
        <input className="px-3 py-2 border rounded" placeholder="Company" value={formState.company || ""} onChange={(e) => handleChange("company", e.target.value)} />
        
        <h4 className="col-span-1 md:col-span-4 font-semibold text-stone-800 mb-2 mt-4">Contact Details</h4>
        <input className="px-3 py-2 border rounded" placeholder="Name" value={formState.name || ""} onChange={(e) => handleChange("name", e.target.value)} />
        <input className="px-3 py-2 border rounded" placeholder="Surname" value={formState.surname || ""} onChange={(e) => handleChange("surname", e.target.value)} />
        <input type="email" className="px-3 py-2 border rounded" placeholder="Email" value={formState.email || ""} onChange={(e) => handleChange("email", e.target.value)} />
        <input className="px-3 py-2 border rounded" placeholder="Cell" value={formState.cell || ""} onChange={(e) => handleChange("cell", e.target.value)} />
        <input className="px-3 py-2 border rounded" placeholder="Tel" value={formState.tel || ""} onChange={(e) => handleChange("tel", e.target.value)} />
        <input className="px-3 py-2 border rounded" placeholder="Broker" value={formState.broker || ""} onChange={(e) => handleChange("broker", e.target.value)} />
        <textarea className="col-span-1 md:col-span-4 px-3 py-2 border rounded" placeholder="Comment" value={formState.comment || ""} onChange={(e) => handleChange("comment", e.target.value)} />
        
        <div className="col-span-1 md:col-span-4 flex gap-2 justify-end">
          <button onClick={onCancel} className="px-3 py-2 rounded border">Cancel</button>
          <button onClick={handleSave} className="px-3 py-2 rounded bg-violet-500 text-white">Save</button>
        </div>
      </div>
    );
  }

  // Default/dynamic form for all other sections
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-2">
      {columns.map((col) => {
        const wide = ["address", "description", "propertyAddress", "brokerComment", "brokersComments", "comment", "comments"].includes(col.key as string);
        return (
          <div key={col.key} className={wide ? "col-span-1 md:col-span-2" : "col-span-1"}>
            <label className="block text-sm font-medium text-stone-700 mb-1">{col.label}</label>
            {wide ? (
              <textarea
                className="w-full px-3 py-2 border rounded-md bg-white text-sm resize-y min-h-[80px]"
                placeholder={col.label}
                value={(formState[col.key] as string) || ""}
                onChange={(e) => handleChange(col.key, e.target.value)}
              />
            ) : (
              <input
                type={
                  (col.key as string).includes("Date") || col.key === "dateAdded" || col.key === "auctionDate" ? "date" :
                  ["email", "contactNumberEmail"].includes(col.key as string) ? "email" :
                  ["cell", "tel", "contactNumber", "cellphoneNo", "ownerNumber", "number"].includes(col.key as string) ? "tel" :
                  ["googleLink", "googleMapLink"].includes(col.key as string) ? "url" :
                  (col.key === "biddersNumber" ? "number" : "text")
                }
                className="w-full px-3 py-2 border rounded-md bg-white text-sm"
                placeholder={col.label}
                value={(formState[col.key] as string) || ""}
                onChange={(e) => handleChange(col.key, e.target.value)}
              />
            )}
          </div>
        );
      })}

      <div className="col-span-1 md:col-span-2 flex gap-3 justify-end mt-2">
        <button onClick={onCancel} className="px-4 py-2 rounded-md border text-sm">Cancel</button>
        <button onClick={handleSave} className="px-4 py-2 rounded-md bg-violet-600 text-white text-sm shadow">Save</button>
      </div>
    </div>
  );
};

export default CoreTables;
