package synthetic;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.ModelAndView;
import org.springframework.web.servlet.view.RedirectView;
@Controller class RecordController {
  static final String FORM = "records/form";
  @GetMapping("/records/new") String form() { return FORM; }
  @PostMapping("/records/new") String save(Record record, boolean invalid) {
    if (invalid) return FORM;
    return "redirect:/records/" + record.identity();
  }
  @GetMapping("/records/{id}") ModelAndView detail() { return new ModelAndView("records/detail"); }
  @GetMapping("/records/find") String find() { return "records/find"; }
  @GetMapping("/records") String search(int count) {
    if (count == 0) return "records/find";
    if (count == 1) return "redirect:/records/" + identity();
    return "records/list";
  }
  @GetMapping("/literal") String literal() { return "redirect:/records/7"; }
  @GetMapping("/forward") String forward() { return "forward:/records/7"; }
  @GetMapping("/mav") ModelAndView mav() { return new ModelAndView("redirect:/records/7"); }
  @GetMapping("/rv") RedirectView rv() { return new RedirectView("/records/7"); }
  @GetMapping("/dynamic") String dynamic() { return destinationName(); }
  @GetMapping("/variable") String variable(String requested) { return requested; }
  @GetMapping("/overlap/{first}") String first() { return "records/detail"; }
  @GetMapping("/overlap/{second}") String second() { return "records/other"; }
  @GetMapping("/ambiguous") String ambiguous() { return "redirect:/overlap/7"; }
  @GetMapping("/missing") String missing() { return "redirect:/absent"; }
  @GetMapping("/changed") ModelAndView changed() {
    ModelAndView result = new ModelAndView("records/detail");
    result = new ModelAndView("records/other");
    return result;
  }
  @GetMapping("/setter") ModelAndView setter(String name) {
    ModelAndView result = new ModelAndView("records/detail");
    result.setViewName(name);
    return result;
  }
  @GetMapping("/external") String external() { return "redirect:https://example.invalid/records/7"; }
  @GetMapping("/cycle-a") String cycleA() { return "redirect:/cycle-b"; }
  @GetMapping("/cycle-b") String cycleB() { return "redirect:/cycle-a"; }
  @PostMapping("/bad-forward") String badForward() { return "forward:/records/7"; }
  @GetMapping("/callback") String callback() {
    java.util.concurrent.Callable<String> ignored = () -> { return "records/other"; };
    return "records/detail";
  }
  @GetMapping("/aliased") ModelAndView aliased(String name) {
    ModelAndView result = new ModelAndView("records/detail");
    ModelAndView alias = result;
    alias.setViewName(name);
    return result;
  }
  @GetMapping("/same-view") String sameView(boolean first) {
    if (first) return "records/detail";
    return "records/detail";
  }
  @GetMapping("/partial") String partial(Record record) { return "redirect:/records/prefix" + record.identity(); }
  @GetMapping("/shadow") String shadow(String FORM) { return FORM; }
}
