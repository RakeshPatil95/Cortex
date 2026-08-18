"use client"

import * as React from "react"
import { Calendar as CalendarIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { useTranslations } from "@/lib/translations"

export function DatePicker({
  value,
  onChange,
  placeholder = "Pick a date",
  className,
  disabled = false,
  ...props
}) {
  const { isRTL } = useTranslations();
  
  const handleDateChange = (e) => {
    const dateValue = e.target.value;
    if (dateValue) {
      onChange(new Date(dateValue));
    } else {
      onChange(null);
    }
  };

  const formatDateForInput = (date) => {
    if (!date) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  return (
    <div className="relative">
      <CalendarIcon className={`absolute top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground ${isRTL ? 'right-3' : 'left-3'}`} />
      <Input
        type="date"
        value={formatDateForInput(value)}
        onChange={handleDateChange}
        placeholder={placeholder}
        disabled={disabled}
        className={cn(
          "w-full",
          isRTL ? "pr-10 text-right" : "pl-10 text-left",
          className
        )}
        {...props}
      />
    </div>
  )
}
