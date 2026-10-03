package synthetic;
import org.springframework.web.bind.annotation.*;import org.springframework.http.ResponseEntity;import javax.validation.Valid;import org.springframework.validation.annotation.Validated;
@RestController class ApiController {
@GetMapping("/api/exact") Reply exact(){return null;}
@PostMapping(value="/api/legacy",consumes="application/json") Reply legacy(@Valid @RequestBody LegacyInput body){return null;}
@PostMapping("/api/modern") ResponseEntity<Reply> modern(@Validated @RequestBody ModernInput body){return null;}
@GetMapping("/api/items/{id}") Reply item(){return null;}
@GetMapping("/api/wild/*") Reply wildcard(){return null;}
@GetMapping("/api/deep/**") Reply deep(){return null;}
@GetMapping("/api/ambiguous/{id}") Reply ambiguous(){return null;}
@GetMapping("/api/ambiguous/7") Reply literal(){return null;}
@RequestMapping(value="/api/request",method=RequestMethod.PUT) Reply request(){return null;}
} class Reply {long id;String status;}
