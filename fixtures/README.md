# ScreenTrace fixtures

These minimal, source-only projects are regression inputs for the supported server-rendered application families. They are intentionally not buildable applications; ScreenTrace must analyze them without executing or modifying them.

- `struts`: Struts 1 Action, form, forward, and JSP interaction.
- `struts-spring`: Struts 1 Action resolved through a Spring XML bean.
- `spring-mvc-jsp`: annotation-based Spring MVC Controller and JSP form/link interaction.
- `spring-boot-jsp`: Spring Boot Controller returning a JSP view.

WP10 的完整自行撰寫合成來源、Struts 2 拒絕案例與逐條 WP2–WP5 語法清單見 [wp10/README.md](wp10/README.md)。既有小型回歸 fixture 與斷言保持不變。
