"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { RotateCw } from "lucide-react";

/**
 * Formats a raw stat value for display in the table.
 * Converts bytes to KB/MB, formats timestamps, and handles different data types.
 */
const formatStatValue = (key: string, value: any): string => {
  if (typeof value === "number") {
    if (key.toLowerCase().includes("bytes")) {
      if (value > 1024 * 1024)
        return `${(value / (1024 * 1024)).toFixed(2)} MB`;
      if (value > 1024) return `${(value / 1024).toFixed(2)} KB`;
      return `${value} Bytes`;
    }
    if (key.toLowerCase().includes("timestamp")) {
      return new Date(value).toLocaleString();
    }
    // Check if it's a float
    if (value % 1 !== 0) {
      return value.toFixed(4);
    }
    return value.toLocaleString();
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  if (typeof value === "object" && value !== null) {
    return JSON.stringify(value);
  }
  if (value === undefined || value === null) {
    return "N/A";
  }
  return String(value);
};

/**
 * Renders a single table of stats for one RTCStats object.
 */
const StatsTable = ({ statObject }: { statObject: RTCStats }) => {
  // Sort keys alphabetically for consistent order, with 'id' and 'type' first.
  const sortedKeys = useMemo(
    () =>
      Object.keys(statObject).sort((a, b) => {
        if (a === "id" || a === "type") return -1;
        if (b === "id" || b === "type") return 1;
        return a.localeCompare(b);
      }),
    [statObject]
  );

  return (
    <Table className="w-full overflow-auto">
      <TableBody>
        {sortedKeys.map((key) => (
          <TableRow key={key}>
            <TableCell className="font-medium text-muted-foreground w-1/3">
              {key}
            </TableCell>
            <TableCell className="break-all">
              {formatStatValue(key, statObject[key])}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};

/**
 * The main dialog component to display WebRTC stats.
 * @param isOpen - Controls the visibility of the dialog.
 * @param setIsOpen - Function to update the visibility state.
 * @param getTransportStats - The function from the store to fetch transport stats.
 */
export const StatsDialog = ({
  isOpen,
  setIsOpen,
  getTransportStats,
}: {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  // This type correctly reflects the return value of the standard transport.getStats() method.
  getTransportStats: (
    transportType: "send" | "receive"
  ) => Promise<RTCStatsReport | null>;
}) => {
  // This state will now hold a single, merged map of individual RTCStats objects.
  const [stats, setStats] = useState<Map<string, RTCStats> | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchStats = useCallback(async () => {
    if (isLoading) return; // Prevent concurrent fetches
    setIsLoading(true);
    try {
      // Fetch stats for both transports
      const sendStatsReport = await getTransportStats("send");
      const recvStatsReport = await getTransportStats("receive");

      // Correctly merge two RTCStatsReport objects into a single Map.
      // RTCStatsReport is not spreadable with .entries(), so we use .forEach().
      const mergedStats = new Map<string, RTCStats>();
      sendStatsReport?.forEach((value, key) => {
        mergedStats.set(key, value);
      });
      recvStatsReport?.forEach((value, key) => {
        mergedStats.set(key, value);
      });

      setStats(mergedStats);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (error) {
      console.error("Failed to fetch WebRTC stats:", error);
    } finally {
      setIsLoading(false);
    }
  }, [getTransportStats, isLoading]);

  // Effect to fetch stats periodically when the dialog is open
  useEffect(() => {
    if (isOpen) {
      fetchStats(); // Fetch immediately on open
      const intervalId = setInterval(fetchStats, 5000); // Refresh every 5 seconds
      return () => clearInterval(intervalId); // Cleanup on close/unmount
    }
  }, [isOpen, fetchStats]);

  // Group the stats by their 'type' property (e.g., 'inbound-rtp', 'candidate-pair').
  const { groupedStats, statTypes } = useMemo(() => {
    if (!stats || stats.size === 0) {
      return { groupedStats: {}, statTypes: [] };
    }
    const groups: { [key: string]: RTCStats[] } = {};

    // With the corrected data structure, we can iterate directly over the map of stats.
    stats.forEach((stat) => {
      // 'stat' is now correctly an RTCStats object.
      if (!groups[stat.type]) {
        groups[stat.type] = [];
      }
      groups[stat.type].push(stat);
    });

    const sortedStatTypes = Object.keys(groups).sort();
    return { groupedStats: groups, statTypes: sortedStatTypes };
  }, [stats]);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-5xl h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-2xl">WebRTC Statistics</DialogTitle>
          <DialogDescription>
            Live stats from the server.{" "}
            {lastUpdated ? `Last updated: ${lastUpdated}` : ""}
          </DialogDescription>
        </DialogHeader>

        {statTypes.length > 0 ? (
          <div className="overflow-auto w-full">
            <Tabs
              defaultValue={statTypes[0]}
              className="flex-grow flex flex-col min-h-0 w-full overflow-auto"
            >
              <TabsList className="flex-shrink-0 w-full h-full overflow-auto pl-28">
                {statTypes.map((type) => (
                  <TabsTrigger key={type} value={type} className="w-full">
                    {type}
                  </TabsTrigger>
                ))}
              </TabsList>
              <div className="flex-grow mt-4 pr-4 w-fit overflow-auto">
                {/* <ScrollBar orientation="horizontal" /> */}

                {statTypes.map((type) => (
                  <TabsContent
                    key={type}
                    value={type}
                    className="space-y-4"
                  >
                    {groupedStats[type].map((stat) => (
                      <Card key={stat.id} className="w-full overflow-auto">
                        <CardHeader>
                          <CardTitle className="text-lg break-all">
                            {stat.id}
                          </CardTitle>
                          <CardDescription>Type: {stat.type}</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <StatsTable statObject={stat} />
                        </CardContent>
                      </Card>
                    ))}
                  </TabsContent>
                ))}
              </div>
            </Tabs>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-slate-500">
            {isLoading ? "Loading stats..." : "No stats available to display."}
          </div>
        )}

        <DialogFooter className="mt-4 flex-shrink-0 sm:justify-between">
          <Button variant="ghost" onClick={fetchStats} disabled={isLoading}>
            <RotateCw
              className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
          <Button variant="outline" onClick={() => setIsOpen(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
