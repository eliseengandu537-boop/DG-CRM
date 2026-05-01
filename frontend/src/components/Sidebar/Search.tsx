"use client";

import React, { useState } from "react";
import { FiSearch } from "react-icons/fi";
import { CommandMenu } from "./CommandMenu";

interface SearchProps {
  onPageChange?: (page: string) => void;
}

export const Search: React.FC<SearchProps> = ({ onPageChange }) => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="mb-2">
        <div
          onClick={() => setOpen(true)}
          className="bg-stone-200 w-full relative rounded-md flex items-center px-2 py-1.5 text-sm cursor-pointer hover:bg-stone-300 transition-colors"
        >
          <FiSearch className="mr-2" />
          <input
            onFocus={() => setOpen(true)}
            onClick={(e) => {
              e.stopPropagation();
              setOpen(true);
            }}
            type="text"
            placeholder="Search"
            readOnly
            className="w-full bg-transparent placeholder:text-stone-400 focus:outline-none cursor-pointer"
          />
        </div>
      </div>

      <CommandMenu open={open} setOpen={setOpen} onPageChange={onPageChange} />
    </>
  );
};
