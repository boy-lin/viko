import React from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Popover,
    PopoverContent,
    PopoverAnchor,
} from "@/components/ui/popover";

import { OutputLocationSelect } from "@/components/biz-form/OutputLocationSelect";


interface ConverterFooterProps {
    onConfirm: () => Promise<void>;
    onDelete: () => Promise<void>;
    onConfirmDelete: () => Promise<void>;
    isDeletePopoverOpen: boolean;
    setIsDeletePopoverOpen: (open: boolean) => void;
    children?: React.ReactNode;
}

export const ConverterFooter: React.FC<ConverterFooterProps> = ({
    onConfirm,
    onDelete,
    onConfirmDelete,
    isDeletePopoverOpen,
    setIsDeletePopoverOpen,
    children,
}) => {
    return (
        <div className="w-full flex items-end justify-between bg-background mt-auto">
            <div className="flex items-center gap-6">
                {children}

                {/* Save to Label and Select */}
                <div className="flex flex-col items-start gap-2">
                    <span className="text-sm font-medium text-muted-foreground">
                        保存到
                    </span>
                    <div className="flex items-center gap-2">
                        <OutputLocationSelect className="w-[14em]" />
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                    <Popover
                        open={isDeletePopoverOpen}
                        onOpenChange={setIsDeletePopoverOpen}
                    >
                        <PopoverAnchor asChild>
                            <Button
                                variant="outline"
                                size="icon"
                                className="text-red-500 border-red-200 hover:bg-red-50 hover:text-red-600"
                                onClick={onDelete}
                            >
                                <Trash2 className="w-4 h-4" />
                            </Button>
                        </PopoverAnchor>
                        <PopoverContent className="w-64" align="end">
                            <div className="space-y-3">
                                <div className="space-y-1">
                                    <h4 className="text-sm font-semibold">确认删除</h4>
                                    <p className="text-xs text-muted-foreground">
                                        当前有任务正在执行中，是否中断并清空所有执行中的任务？
                                    </p>
                                </div>
                                <div className="flex items-center justify-end gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setIsDeletePopoverOpen(false)}
                                    >
                                        取消
                                    </Button>
                                    <Button
                                        variant="destructive"
                                        size="sm"
                                        onClick={onConfirmDelete}
                                    >
                                        确认删除
                                    </Button>
                                </div>
                            </div>
                        </PopoverContent>
                    </Popover>
                </div>

                <Button
                    className="h-11 px-8 text-base font-semibold shadow-lg shadow-purple-200 dark:shadow-purple-900/20"
                    onClick={onConfirm}
                >
                    全部开始
                </Button>
            </div>
        </div>
    );
};
