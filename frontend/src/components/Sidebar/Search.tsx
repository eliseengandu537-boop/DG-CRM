"use client";

import React, { useState } from "react";
import { FiCommand, FiSearch } from "react-icons/fi";
import { CommandMenu } from "./CommandMenu";

export const Search = () => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="flex flex-col items-center mb-2">
        
        <div 
          onClick={() => setOpen(true)}
          className="bg-stone-200 w-full relative rounded flex items-center px-2 py-1.5 text-sm cursor-pointer hover:bg-stone-300 transition-colors"
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
            className="w-full bg-transparent placeholder:text-stone-400 focus:outline-none"
          />
        </div>
      </div>

      <CommandMenu open={open} setOpen={setOpen} />
    </>
  );
};
