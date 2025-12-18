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
    <div className="container mx-auto px-4 md:px-6 lg:px-8 py-12 md:py-16 lg:py-24">
      <div className="space-y-6">
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
            <h1 className="text-2xl font-bold text-foreground">模块管理</h1>
            <p className="text-sm text-muted-foreground mt-2">
              管理已下载的资源文件，支持清理删除
            </p>
          </div>
        </div>
        <ModuleManagerList />
      </div>
    </div>
  );
};

export default ModuleManagerPage;
