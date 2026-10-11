package example;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
@Controller @RequestMapping("/owners")
public class OwnerController {
  @GetMapping("/{ownerId}") public String detail() { return "owners/detail"; }
  @GetMapping("/{ownerId}/edit") public String edit() { return "owners/edit"; }
}
