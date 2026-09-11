package io.screentrace.core;
import static org.junit.jupiter.api.Assertions.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*; import org.junit.jupiter.api.Test;
class PrototypeModelTest { @Test void overlayDoesNotMutateBaselinePrototype() throws Exception { var baseline=new PrototypeModel("1",List.of(new PrototypeModel.PrototypeScreen("p:login","screen:login","Login","/login",null)),List.of()); var overlay=new EditOverlay("1",List.of(new EditOverlay.EditOperation("p:login","component:old",EditOverlay.Operation.HIDE,Map.of()))); assertEquals(1,baseline.screens().size()); assertTrue(new ObjectMapper().writeValueAsString(overlay).contains("HIDE")); } }
