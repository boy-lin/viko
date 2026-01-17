import React, { useState, useEffect } from "react";
import { ConverterHeader } from "./components/ConverterHeader";
import { ConverterItem } from "./components/ConverterItem";
import { FinishedItem } from "./components/FinishedItem";
import { ConverterFooter } from "./v2/ConverterFooter";
import { useConverterStore } from "@/stores/converterStore";

const ConverterPage: React.FC = () => {
  const { tasks, init, activeTab, setActiveTab } = useConverterStore();

  useEffect(() => {
    init();
  }, [init]);

  const filteredTasks = tasks.filter(task => {
    if (activeTab === 'converting') {
      return task.status !== 'finished';
    } else {
      return task.status === 'finished';
    }
  });

  return (
    <div className="flex flex-col h-full bg-background">
      <ConverterHeader
        activeTab={activeTab}
        onTabChange={setActiveTab}
        convertingCount={tasks.filter(t => t.status !== 'finished').length}
      />

      <div className="flex-1 overflow-y-auto min-h-0 space-y-4 py-2 px-4">
        {filteredTasks.length > 0 ? (
          filteredTasks.map((task) => (
            activeTab === 'converting' ? (
              <ConverterItem key={task.id} task={task} />
            ) : (
              <FinishedItem key={task.id} task={task} />
            )
          ))
        ) : (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            {activeTab === 'converting' ? "No active tasks" : "No finished tasks"}
          </div>
        )}
      </div>

      <ConverterFooter />
    </div>
  );
};

export default ConverterPage;
