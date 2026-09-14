package fixture;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
@Controller @RequestMapping("/orders")
class OrdersController {
  @GetMapping("/search") String form() { return "orders/search"; }
  @PostMapping("/search") String submit() { return "orders/result"; }
}
