import { Menu } from "@tauri-apps/api/menu";

export async function createMenu() {
  const menu = await Menu.new({
    items: [
      {
        id: "quit",
        text: "Quit",
        action: () => {
          console.log("quit pressed");
        },
      },
    ],
  });

  // If a window was not created with an explicit menu or had one set explicitly,
  // this menu will be assigned to it.
  menu.setAsAppMenu().then((res) => {
    console.log("menu set success", res);
  });
}
