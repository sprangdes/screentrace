package synthetic;
import org.springframework.stereotype.Controller;import org.springframework.web.bind.annotation.*;import org.springframework.web.bind.WebDataBinder;import org.springframework.web.servlet.ModelAndView;
@Controller class PageController {
@GetMapping("/page") String page(){return "page";}
@PostMapping("/save") String save(@ModelAttribute("input") Input input){return "page";}
@GetMapping("/orders/{name}") ModelAndView item(){return new ModelAndView("page");}
@InitBinder("input") void binder(WebDataBinder binder){binder.addValidators(new InputValidator());}
}
