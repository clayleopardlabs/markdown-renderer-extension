# Mermaid Diagram Test

## Flowchart
```mermaid
graph TD
    A[Start] --> B{Is it working?}
    B -->|Yes| C[Great!]
    B -->|No| D[Debug]
    D --> B
```

## Sequence Diagram
```mermaid
sequenceDiagram
    participant User
    participant System
    User->>System: Request
    System-->>User: Response
```

## Pie Chart
```mermaid
pie title Test Pie
    "Apples" : 45
    "Bananas" : 30
    "Cherries" : 25
```

## Gantt
```mermaid
gantt
    title A Gantt Diagram
    dateFormat  YYYY-MM-DD
    section Section
    A task           :a1, 2024-01-01, 30d
    Another task     :after a1, 20d
```

## Class Diagram
```mermaid
classDiagram
    class Animal {
        +String name
        +makeSound()
    }
    class Dog {
        +bark()
    }
    Animal <|-- Dog
```

## State Diagram
```mermaid
stateDiagram-v2
    [*] --> Still
    Still --> [*]
    Still --> Moving
    Moving --> Still
    Moving --> Crash
    Crash --> [*]
```

## Entity Relationship
```mermaid
erDiagram
    CUSTOMER ||--o{ ORDER : places
    ORDER ||--|{ LINE-ITEM : contains
    CUSTOMER {
        string name
        string email
    }
```

## Gitgraph
```mermaid
gitGraph
    commit
    commit
    branch develop
    checkout develop
    commit
    commit
    checkout main
    merge develop
    commit
```

## Timeline
```mermaid
timeline
    title History of Social Media
    2004 : Facebook
    2006 : Twitter
    2010 : Instagram
    2016 : TikTok
```

## Mindmap
```mermaid
mindmap
    root((Mindmap))
        Origins
            Long history
        Popularisation
            British popular psychology
