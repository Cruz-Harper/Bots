public class Jigglypuff {
    private String name;
    private int level;
    private int happiness;
    private String attribute;
    private boolean isShiny;
    private boolean isSleeping;

    public Jigglypuff(String name, int level, int happiness, String attribute, boolean isShiny) {
        this.name = name;
        this.level = level;
        this.happiness = happiness;
        this.attribute = attribute;
        this.isShiny = isShiny;
        this.isSleeping = false; // Starts awake by default
    }

    // Getters
    public String getName() { return name; }
    public int getLevel() { return level; }
    public int getHappiness() { return happiness; }
    public String getAttribute() { return attribute; }
    public boolean isShiny() { return isShiny; }
    public boolean isSleeping() { return isSleeping; }

    // Methods
    public void putToSleep() {
        isSleeping = true;
    }

    public void wakeUp() {
        isSleeping = false;
    }

    public void train() {
        if (isSleeping) {
            System.out.println(name + " is sleeping and cannot train right now.");
            return;
        }

        level++;
        String attr = attribute.toLowerCase();

        switch (attr) {
            case "fighter":
                happiness += 10;
                break;
            case "lazy":
                happiness -= 5;
                break;
            case "energetic":
                happiness += 15;
                break;
            case "calm":
                happiness += 2;
                break;
            case "playful":
                happiness += 8;
                break;
            case "serious":
                happiness -= 3;
                break;
            case "curious":
                happiness += 6;
                break;
            default:
                happiness += 5;
        }

        clampHappiness();
        System.out.println(name + " trained! 🎯");
    }

    public void play() {
        if (isSleeping) {
            System.out.println(name + " is sleeping and cannot play right now.");
            return;
        }

        happiness += 10;
        clampHappiness();
        System.out.println(name + " played and feels happier! 🎈");
    }

    private void clampHappiness() {
        happiness = Math.max(0, Math.min(happiness, 100));
    }

    public String toJSON() {
        return String.format(
            "{\"name\":\"%s\",\"level\":%d,\"happiness\":%d,\"attribute\":\"%s\",\"isShiny\":%b,\"isSleeping\":%b}",
            name, level, happiness, attribute, isShiny, isSleeping
        );
    }

    @Override
    public String toString() {
        return name + " [Lvl: " + level + ", Happy: " + happiness + ", Attr: " + attribute +
               ", Shiny: " + isShiny + ", Sleeping: " + isSleeping + "]";
    }

    // 🟡 Main method for testing right inside Jigglypuff.java
    public static void main(String[] args) {
        Jigglypuff puff = new Jigglypuff("Fluffy", 1, 50, "Energetic", false);

        System.out.println("Initial Puff:");
        System.out.println(puff);

        puff.train();
        puff.play();

        puff.putToSleep();
        puff.train();  // Should say it's sleeping

        puff.wakeUp();
        puff.train();

        System.out.println("\nFinal Puff State:");
        System.out.println(puff);

        System.out.println("\nExported to JSON:");
        System.out.println(puff.toJSON());
    }
}
// end :)
