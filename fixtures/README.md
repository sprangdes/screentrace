# ScreenTrace fixtures

These minimal, source-only projects are regression inputs for the supported server-rendered application families. They are intentionally not buildable applications; ScreenTrace must analyze them without executing or modifying them.

- `struts`: Struts 1 Action, form, forward, and JSP interaction.
- `struts-spring`: Struts 1 Action resolved through a Spring XML bean.
- `spring-mvc-jsp`: annotation-based Spring MVC Controller and JSP form/link interaction.
- `spring-boot-jsp`: Spring Boot Controller returning a JSP view.
