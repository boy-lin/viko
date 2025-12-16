import React from "react";
import { useNavigate } from "react-router-dom";
import ModuleManagerList from "@/components/moduleManager/List";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

const ModuleManagerPage: React.FC = () => {
  const navigate = useNavigate();
  const onBack = () => {
    navigate("/");
  };
  return (
    <div className="min-h-screen px-6 py-8 pt-24">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={onBack}
            className="inline-flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            返回
          </Button>
          <div>
            <div className="text-xl font-semibold">模块管理</div>
            <div className="text-sm text-foreground/70">
              管理已下载的资源文件，支持清理删除
            </div>
          </div>
        </div>
        <ModuleManagerList />
      </div>
    </div>
  );
};

export default ModuleManagerPage;
