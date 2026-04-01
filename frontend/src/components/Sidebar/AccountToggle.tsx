import React from "react";

export const AccountToggle = () => {
  return (
    <div className="border-b pb-0 border-stone-300">
      <a
        href="https://www.dg-property.co.za/"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center p-1 cursor-pointer hover:opacity-80 transition-opacity"
      >
        <img
          src="/dg logo crm.png"
          alt="DORM CRM Logo"
          className="h-40 w-40 object-contain drop-shadow-md"
        />
      </a>
    </div>
  );
};
