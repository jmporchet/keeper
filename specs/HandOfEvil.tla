---- MODULE HandOfEvil ----
EXTENDS Naturals, FiniteSets, TLC

CONSTANTS Imps, Jobs, Capacity

None == "none"

ImpStates == {"idle", "held"}
JobPhases == {"absent", "open", "reserved"}

VARIABLES impState, held, jobStatus, jobHolder

vars == <<impState, held, jobStatus, jobHolder>>

TypeOK ==
  /\ impState \in [Imps -> ImpStates]
  /\ held \in SUBSET Imps
  /\ jobStatus \in [Jobs -> JobPhases]
  /\ jobHolder \in [Jobs -> (Imps \cup {None})]
  /\ \A i \in Imps : (impState[i] = "held") <=> (i \in held)

Init ==
  /\ impState = [i \in Imps |-> "idle"]
  /\ held = {}
  /\ jobStatus = [j \in Jobs |-> "absent"]
  /\ jobHolder = [j \in Jobs |-> None]

Create(j) ==
  /\ jobStatus[j] = "absent"
  /\ jobStatus' = [jobStatus EXCEPT ![j] = "open"]
  /\ jobHolder' = [jobHolder EXCEPT ![j] = None]
  /\ UNCHANGED <<impState, held>>

Cancel(j) ==
  /\ jobStatus[j] \in {"open", "reserved"}
  /\ jobStatus' = [jobStatus EXCEPT ![j] = "absent"]
  /\ jobHolder' = [jobHolder EXCEPT ![j] = None]
  /\ UNCHANGED <<impState, held>>

Reserve(i, j) ==
  /\ impState[i] = "idle"
  /\ jobStatus[j] = "open"
  /\ \A k \in Jobs : jobHolder[k] # i
  /\ jobStatus' = [jobStatus EXCEPT ![j] = "reserved"]
  /\ jobHolder' = [jobHolder EXCEPT ![j] = i]
  /\ UNCHANGED <<impState, held>>

Finish(j) ==
  /\ jobStatus[j] = "reserved"
  /\ jobStatus' = [jobStatus EXCEPT ![j] = "absent"]
  /\ jobHolder' = [jobHolder EXCEPT ![j] = None]
  /\ UNCHANGED <<impState, held>>

PickUp(i) ==
  /\ i \notin held
  /\ Cardinality(held) < Capacity
  /\ impState' = [impState EXCEPT ![i] = "held"]
  /\ held' = held \cup {i}
  /\ jobStatus' = [j \in Jobs |-> IF jobHolder[j] = i THEN "open" ELSE jobStatus[j]]
  /\ jobHolder' = [j \in Jobs |-> IF jobHolder[j] = i THEN None ELSE jobHolder[j]]

Drop(i) ==
  /\ i \in held
  /\ impState' = [impState EXCEPT ![i] = "idle"]
  /\ held' = held \ {i}
  /\ UNCHANGED <<jobStatus, jobHolder>>

Next ==
  \/ \E j \in Jobs : Create(j)
  \/ \E j \in Jobs : Cancel(j)
  \/ \E i \in Imps, j \in Jobs : Reserve(i, j)
  \/ \E j \in Jobs : Finish(j)
  \/ \E i \in Imps : PickUp(i)
  \/ \E i \in Imps : Drop(i)

Spec == Init /\ [][Next]_vars

HandCapacity ==
  Cardinality(held) <= Capacity

HeldImpHoldsNoJob ==
  \A i \in held : \A j \in Jobs : jobHolder[j] # i

OneImpPerJob ==
  \A j \in Jobs, k \in Jobs :
    (j # k /\ jobStatus[j] = "reserved" /\ jobStatus[k] = "reserved") => jobHolder[j] # jobHolder[k]

OneJobPerWorker ==
  \A i \in Imps :
    Cardinality({j \in Jobs : jobStatus[j] = "reserved" /\ jobHolder[j] = i}) <= 1

HolderMatchesPhase ==
  \A j \in Jobs :
    /\ (jobStatus[j] = "reserved") <=> (jobHolder[j] \in Imps)
    /\ (jobStatus[j] # "reserved") => jobHolder[j] = None
====
