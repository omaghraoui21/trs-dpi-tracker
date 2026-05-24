import { useState } from "react";
import type { Room } from "@workspace/api-client-react";
import { LotListView } from "@/components/lots/LotListView";
import { LotActiveTracker } from "./LotActiveTracker";
import { LocalPicker } from "./LocalPicker";
import { MachinePicker } from "./MachinePicker";
import { SessionView } from "./SessionView";

type EntryView = "list" | "local" | "machine" | "session" | "active-lot";

export default function EntryPage() {
  // Read ?resume=<lotId> from URL — set when navigating from /lots
  const initialResumeId =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("resume")
      : null;
  const [view, setView] = useState<EntryView>(initialResumeId ? "active-lot" : "list");
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [selectedEquipment, setSelectedEquipment] = useState<{
    id: string;
    code: string;
    name: string;
  } | null>(null);
  const [resumeLotId, setResumeLotId] = useState<string | null>(initialResumeId);

  if (view === "active-lot" && resumeLotId) {
    return (
      <LotActiveTracker
        lotId={resumeLotId}
        onClosed={() => {
          setResumeLotId(null);
          setView("list");
        }}
        onBack={() => {
          setResumeLotId(null);
          setView("list");
        }}
      />
    );
  }

  if (view === "local") {
    return (
      <LocalPicker
        onSelect={(room) => {
          setSelectedRoom(room);
          setView("machine");
        }}
      />
    );
  }

  if (view === "machine" && selectedRoom) {
    return (
      <MachinePicker
        room={selectedRoom}
        onSelect={(eq) => {
          setSelectedEquipment(eq);
          setView("session");
        }}
        onBack={() => setView("local")}
      />
    );
  }

  if (view === "session" && selectedRoom && selectedEquipment) {
    return (
      <SessionView
        room={selectedRoom}
        equipment={selectedEquipment}
        onExit={() => {
          setSelectedRoom(null);
          setSelectedEquipment(null);
          setView("list");
        }}
      />
    );
  }

  return (
    <LotListView
      onNew={() => setView("local")}
      onResume={(id) => {
        setResumeLotId(id);
        setView("active-lot");
      }}
    />
  );
}
