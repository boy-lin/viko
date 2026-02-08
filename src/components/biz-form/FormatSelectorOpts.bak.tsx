export const FormatSelectorOpts = () => {
  return (
    {/* <ScrollArea className="h-full">
              {filteredItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                  <p className="text-sm">No formats found.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-1">
                  {filteredItems.map((item) => (
                    <div
                      key={item.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleSelect(item)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleSelect(item);
                        }
                      }}
                      className={cn(
                        "flex items-center justify-between p-2 rounded-md hover:bg-accent hover:text-accent-foreground text-left transition-colors group cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                        selectedFormat?.id === item.id && "bg-accent/50"
                      )}
                    >
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">
                          {item.label}
                        </span>
                        <div className="flex items-end gap-2 max-w-[300px] text-xs text-muted-foreground">
                          <span className=" whitespace-nowrap">
                            {item.extension?.toUpperCase()}
                          </span>
                          {item.description && (
                            <span
                              className="truncate"
                              title={item.description}
                            >
                              ({item.description})
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {selectedFormat?.id === item.id && (
                          <Check className="w-4 h-4 text-primary" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea> */}
  )
}